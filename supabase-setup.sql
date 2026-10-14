-- ════════════════════════════════════════════════════════════════════
--  ASTERNAL — ESQUEMA SUPABASE
--  Ejecuta TODO este script en: Supabase Dashboard → SQL Editor → Run
--  (Se puede ejecutar completo o en bloques, es idempotente)
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- Permite crear funciones SQL que referencian tablas definidas más abajo en
-- este mismo script (p. ej. has_role usa user_roles). Sin esto, PostgreSQL
-- valida el cuerpo al crearlas y falla en una base vacía.
set check_function_bodies = off;

-- ─────────────────────────── ENUMS ───────────────────────────
do $$ begin
  create type public.app_role as enum ('admin','moderator','user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum ('comment','reply','reaction','repost','mention');
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.notification_type add value if not exists 'follow';
  alter type public.notification_type add value if not exists 'like';
  alter type public.notification_type add value if not exists 'favorite';
  alter type public.notification_type add value if not exists 'game';
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_media_type as enum ('none','image','video','link');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reaction_type as enum ('like','favorite');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open','reviewed','dismissed','actioned');
exception when duplicate_object then null; end $$;

-- ─────────────────────────── HELPERS ───────────────────────────
create or replace function public.has_role(_role public.app_role, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_mod_or_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','moderator'));
$$;

create or replace function public.is_plus_active(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_plus from public.profiles where id = _uid), false);
$$;

-- ─────────────────────────── PROFILES ───────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  avatar_url text,
  avatar_spec jsonb,
  user_code text,
  bio text,
  banner_url text,
  pronouns text,
  location text,
  status_text text,
  status_emoji text,
  accent_color text,
  favorite_genre text,
  custom_title text,
  birthday text,
  show_orbes boolean not null default true,
  theme_mode text not null default 'dark',
  interests text[] not null default '{}',
  orbes bigint not null default 100,
  is_plus boolean not null default false,
  show_plus_badge boolean not null default false,
  avatar_frame text,
  social_links jsonb,
  last_plus_claim_at timestamptz,
  plus_expires_at timestamptz,
  name_effect text,
  profile_background text,
  post_effect text,
  creator_card_style jsonb,
  featured_post_id uuid,
  trust_points smallint not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ID público de usuario: único por cuenta (AST-XXXXXX). El frontend también
-- deriva un ID determinista del UUID como respaldo hasta que este backfill
-- o el trigger asignen el código persistido.
create unique index if not exists profiles_user_code_key
  on public.profiles (user_code) where user_code is not null;

-- ─────────────────────────── TAGS ───────────────────────────
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
alter table public.tags enable row level security;

-- ─────────────────────────── POSTS ───────────────────────────
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  media_urls text[] not null default '{}',
  media_type public.post_media_type not null default 'none',
  link_url text,
  category text,
  cover_url text,
  screenshots text[] not null default '{}',
  allow_remix boolean not null default true,
  price_orbes bigint not null default 0,
  text_color text,
  html_content text,
  document_paths text[] not null default '{}',
  document_names text[] not null default '{}',
  pinned_game_id uuid,
  locked_content text,
  unlock_reactions_goal bigint,
  unlock_at timestamptz,
  entrance_effect text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.posts enable row level security;
-- Columna de capturas de juego (añadida después del primer despliegue: idempotente)
alter table public.posts add column if not exists screenshots text[] not null default '{}';
-- Género/categoría del juego (p. ej. Acción, Puzzle) que aparece en la ficha
-- (idempotente, añadida después del primer despliegue)
alter table public.posts add column if not exists game_genre text;
-- Reventa de obras de la galería: vendedor actual, precio de reventa y dueño actual
-- (author_id siempre es el creador original; current_owner_id es quien la posee hoy)
alter table public.posts add column if not exists seller_id uuid references auth.users(id) on delete set null;
alter table public.posts add column if not exists resale_price_orbes bigint;
alter table public.posts add column if not exists current_owner_id uuid references auth.users(id) on delete set null;
create index if not exists posts_seller_idx on public.posts (seller_id) where seller_id is not null;

-- ─────────────────────────── COMMENTS ───────────────────────────
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.comments enable row level security;

-- ─────────────────────────── REACTIONS ───────────────────────────
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  type public.reaction_type not null,
  created_at timestamptz not null default now()
);
alter table public.reactions enable row level security;

-- ─────────────────────────── REPOSTS ───────────────────────────
create table if not exists public.reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  quote text,
  created_at timestamptz not null default now()
);
alter table public.reposts enable row level security;

-- ─────────────────────────── NOTIFICATIONS ───────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type public.notification_type not null default 'comment',
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;

-- ─────────────────────────── REPORTS / BLOCKS ───────────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null,
  status public.report_status not null default 'open',
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;

-- ─────────────────────────── GAME PURCHASES / ORBES ───────────────────────────
create table if not exists public.game_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  price_paid bigint not null default 0,
  purchased_at timestamptz not null default now(),
  unique (user_id, post_id)
);
alter table public.game_purchases enable row level security;

-- Jugadas de juegos (para el ranking de «más jugados en las últimas 24h»).
-- Una fila por jugada: se inserta al lanzar un juego.
create table if not exists public.game_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.game_plays enable row level security;
create index if not exists game_plays_24h_idx on public.game_plays (post_id, created_at desc);

create table if not exists public.orbe_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null,
  kind text not null default 'adjustment',
  post_id uuid references public.posts(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);
alter table public.orbe_transactions enable row level security;

-- ─────────────────────────── POLLS ───────────────────────────
create table if not exists public.post_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.post_polls enable row level security;

create table if not exists public.post_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.post_polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);
alter table public.post_poll_votes enable row level security;

create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);
alter table public.post_tags enable row level security;

-- ─────────────────────────── USER PROJECTS ───────────────────────────
create table if not exists public.user_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Proyecto',
  data jsonb not null default '{}',
  published_post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_projects enable row level security;

-- ─────────────────────────── USER ROLES ───────────────────────────
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- ─────────────────────────── BANNED EMAILS ───────────────────────────
create table if not exists public.banned_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text,
  banned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.banned_emails enable row level security;

-- ─────────────────────────── EVENTS ───────────────────────────
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  banner_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  prize_pool bigint,
  prize_description text,
  rules text,
  status text not null default 'upcoming',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;

create table if not exists public.event_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  unique (event_id, author_id)
);
alter table public.event_submissions enable row level security;

-- ─────────────────────────── FOLLOWS ───────────────────────────
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id)
);
alter table public.follows enable row level security;

-- ─────────────────────────── FOROS ───────────────────────────
create table if not exists public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  icon text not null default 'globe',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.forum_categories enable row level security;

create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.forum_categories(id) on delete cascade,
  title text not null,
  content text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_username text not null default '',
  tags text[] not null default '{}',
  upvotes int not null default 0,
  downvotes int not null default 0,
  media_urls text[] not null default '{}',
  media_type text not null default 'none',
  document_urls text[] not null default '{}',
  document_names text[] not null default '{}',
  pinned boolean not null default false,
  closed boolean not null default false,
  solution_post_id uuid,
  views int not null default 0,
  post_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_post_at timestamptz not null default now(),
  last_post_author text not null default ''
);
alter table public.forum_threads enable row level security;

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  content text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_username text not null default '',
  parent_post_id uuid references public.forum_posts(id) on delete cascade,
  quote_post_id uuid,
  quote_content text,
  quote_author text,
  upvotes int not null default 0,
  downvotes int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
alter table public.forum_posts enable row level security;

do $$ begin
  alter table public.forum_threads
    add constraint forum_threads_solution_fk foreign key (solution_post_id)
    references public.forum_posts(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.forum_votes (
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('up','down')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.forum_votes enable row level security;

create table if not exists public.forum_thread_votes (
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('up','down')),
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table public.forum_thread_votes enable row level security;

-- ─────────────────────────── RLS POLICIES ───────────────────────────

-- profiles: lectura pública, edición propia o staff
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (auth.uid() = id);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (auth.uid() = id or public.is_mod_or_admin(auth.uid()));

-- tags
drop policy if exists tags_read on public.tags;
create policy tags_read on public.tags for select using (true);
drop policy if exists tags_insert on public.tags;
create policy tags_insert on public.tags for insert with check (true);

-- posts: lectura pública (no borrados), insert/update/delete autor o staff
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (deleted_at is null or author_id = auth.uid());
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert with check (auth.uid() = author_id);
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update using (auth.uid() = author_id or public.is_mod_or_admin(auth.uid()));
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete using (auth.uid() = author_id or public.is_mod_or_admin(auth.uid()));

-- comments
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select using (true);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert with check (auth.uid() = author_id);
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update using (auth.uid() = author_id or public.is_mod_or_admin(auth.uid()));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete using (auth.uid() = author_id or public.is_mod_or_admin(auth.uid()));

-- reactions
drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions for select using (true);
drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert with check (auth.uid() = user_id);
drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete using (auth.uid() = user_id);

-- reposts
drop policy if exists reposts_read on public.reposts;
create policy reposts_read on public.reposts for select using (true);
drop policy if exists reposts_insert on public.reposts;
create policy reposts_insert on public.reposts for insert with check (auth.uid() = user_id);
drop policy if exists reposts_delete on public.reposts;
create policy reposts_delete on public.reposts for delete using (auth.uid() = user_id);

-- notifications: solo el dueño lee/actualiza. El INSERT se permite a quien
-- actúa (actor_id = auth.uid()) para que otras cuentas puedan notificarle,
-- y la función push_notification (security definer) centraliza las reglas.
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select using (auth.uid() = user_id);
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert with check (auth.uid() = actor_id);
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (auth.uid() = user_id);

-- ─────────────── NOTIFICACIONES: crear (con reglas de «solo lo importante») ───────────────
-- La usan follows, comentarios, respuestas, reacciones, reposts y menciones.
-- Reglas:
--  * No notificar a uno mismo.
--  * No duplicar reacciones del mismo actor sobre el mismo objetivo sin leer.
--  * Un follow solo notifica una vez (si ya existe una del mismo actor, no duplica).
create or replace function public.push_notification(
  _user_id uuid,
  _actor_id uuid,
  _type public.notification_type,
  _post_id uuid default null,
  _comment_id uuid default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if _user_id is null or _actor_id is null or _user_id = _actor_id then
    return;
  end if;
  -- Reacciones: solo la primera cuenta (hasta que se lea); las demás se ignoran.
  if _type in ('reaction', 'like', 'favorite') then
    if exists (
      select 1 from public.notifications n
      where n.user_id = _user_id
        and n.actor_id = _actor_id
        and n.type = _type
        and n.post_id is not distinct from _post_id
        and n.comment_id is not distinct from _comment_id
        and n.read = false
    ) then
      return;
    end if;
  end if;
  -- Follows: si ya notificaste a esta persona y no lo ha leído, no acumular.
  if _type = 'follow' then
    if exists (
      select 1 from public.notifications n
      where n.user_id = _user_id and n.actor_id = _actor_id and n.type = 'follow' and n.read = false
    ) then
      return;
    end if;
  end if;
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
  values (_user_id, _actor_id, _type, _post_id, _comment_id);
end;
$$;

grant execute on function public.push_notification(uuid, uuid, public.notification_type, uuid, uuid) to anon, authenticated, service_role;

-- Realtime: cada usuario recibe solo sus propias notificaciones (RLS aplica).
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
  when others then null;
end $$;

-- reports
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select using (public.is_mod_or_admin(auth.uid()));
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert with check (auth.uid() = reporter_id);

-- blocks
drop policy if exists blocks_read on public.blocks;
create policy blocks_read on public.blocks for select using (auth.uid() = blocker_id);
drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks for insert with check (auth.uid() = blocker_id);
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete using (auth.uid() = blocker_id);

-- game_purchases: lectura pública (para saber qué se posee), inserción vía RPC
drop policy if exists purchases_read on public.game_purchases;
create policy purchases_read on public.game_purchases for select using (true);
drop policy if exists purchases_insert on public.game_purchases;
create policy purchases_insert on public.game_purchases for insert with check (auth.uid() = user_id);

-- game_plays: lectura pública (rankings) e inserción por el propio jugador
drop policy if exists plays_read on public.game_plays;
create policy plays_read on public.game_plays for select using (true);
drop policy if exists plays_insert on public.game_plays;
create policy plays_insert on public.game_plays for insert with check (auth.uid() = user_id);

-- orbe_transactions: solo el dueño
drop policy if exists orbex_read on public.orbe_transactions;
create policy orbex_read on public.orbe_transactions for select using (auth.uid() = user_id);

-- polls
drop policy if exists polls_read on public.post_polls;
create policy polls_read on public.post_polls for select using (true);
drop policy if exists polls_insert on public.post_polls;
create policy polls_insert on public.post_polls for insert with check (true);
drop policy if exists poll_votes_read on public.post_poll_votes;
create policy poll_votes_read on public.post_poll_votes for select using (true);
drop policy if exists poll_votes_insert on public.post_poll_votes;
create policy poll_votes_insert on public.post_poll_votes for insert with check (auth.uid() = user_id);
drop policy if exists poll_votes_delete on public.post_poll_votes;
create policy poll_votes_delete on public.post_poll_votes for delete using (auth.uid() = user_id);
drop policy if exists post_tags_read on public.post_tags;
create policy post_tags_read on public.post_tags for select using (true);
drop policy if exists post_tags_insert on public.post_tags;
create policy post_tags_insert on public.post_tags for insert with check (true);

-- user_projects: solo el dueño
drop policy if exists projects_read on public.user_projects;
create policy projects_read on public.user_projects for select using (auth.uid() = user_id);
drop policy if exists projects_insert on public.user_projects;
create policy projects_insert on public.user_projects for insert with check (auth.uid() = user_id);
drop policy if exists projects_update on public.user_projects;
create policy projects_update on public.user_projects for update using (auth.uid() = user_id);
drop policy if exists projects_delete on public.user_projects;
create policy projects_delete on public.user_projects for delete using (auth.uid() = user_id);

-- user_roles: lectura pública (para saber mods/admin), gestión staff
drop policy if exists roles_read on public.user_roles;
create policy roles_read on public.user_roles for select using (true);
drop policy if exists roles_insert on public.user_roles;
create policy roles_insert on public.user_roles for insert with check (public.has_role('admin', auth.uid()));
drop policy if exists roles_delete on public.user_roles;
create policy roles_delete on public.user_roles for delete using (public.has_role('admin', auth.uid()));

-- banned_emails: solo staff
drop policy if exists bans_read on public.banned_emails;
create policy bans_read on public.banned_emails for select using (public.is_mod_or_admin(auth.uid()));
drop policy if exists bans_insert on public.banned_emails;
create policy bans_insert on public.banned_emails for insert with check (public.is_mod_or_admin(auth.uid()));
drop policy if exists bans_delete on public.banned_emails;
create policy bans_delete on public.banned_emails for delete using (public.is_mod_or_admin(auth.uid()));

-- events: lectura pública, creación/gestión solo admin
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (true);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert with check (public.is_mod_or_admin(auth.uid()));
drop policy if exists events_update on public.events;
create policy events_update on public.events for update using (public.is_mod_or_admin(auth.uid()));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete using (public.is_mod_or_admin(auth.uid()));
drop policy if exists subs_read on public.event_submissions;
create policy subs_read on public.event_submissions for select using (true);
drop policy if exists subs_insert on public.event_submissions;
create policy subs_insert on public.event_submissions for insert with check (auth.uid() = author_id);

-- ─────────────────────────── EVENT PARTICIPANTS (inscripción real) ───────────
-- Cada usuario puede inscribirse una sola vez por evento. La lectura directa de
-- filas queda restringida (solo el propio usuario o staff); el conteo público y
-- la lista para staff se hacen mediante RPC security definer.
create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
alter table public.event_participants enable row level security;
drop policy if exists evp_read on public.event_participants;
create policy evp_read on public.event_participants for select using (auth.uid() = user_id or public.is_mod_or_admin(auth.uid()));
drop policy if exists evp_insert on public.event_participants;
create policy evp_insert on public.event_participants for insert with check (auth.uid() = user_id);
drop policy if exists evp_delete on public.event_participants;
create policy evp_delete on public.event_participants for delete using (auth.uid() = user_id);

-- Contar inscritos (público): el contador visible para todos.
create or replace function public.count_event_participants(_event_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.event_participants where event_id = _event_id;
$$;

-- Inscribirse (idempotente): no permite inscribirse a eventos finalizados.
create or replace function public.join_event(_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.events where id = _event_id and status = 'completed') then
    raise exception 'event_completed';
  end if;
  insert into public.event_participants (event_id, user_id)
  values (_event_id, auth.uid())
  on conflict (event_id, user_id) do nothing;
end;
$$;

-- Desinscribirse.
create or replace function public.leave_event(_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.event_participants where event_id = _event_id and user_id = auth.uid();
end;
$$;

-- Listar quién se inscribió: SOLO staff (admin/mod). Une con profiles para
-- mostrar avatar, nombre de usuario y fecha de inscripción.
create or replace function public.list_event_participants(_event_id uuid)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  joined_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not public.is_mod_or_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;
  return query
    select p.id, p.display_name, p.username, p.avatar_url, ep.created_at
    from public.event_participants ep
    join public.profiles p on p.id = ep.user_id
    where ep.event_id = _event_id
    order by ep.created_at asc;
end;
$$;

-- follows
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete using (auth.uid() = follower_id);

-- foros
drop policy if exists fc_read on public.forum_categories;
create policy fc_read on public.forum_categories for select using (true);
drop policy if exists fc_insert on public.forum_categories;
create policy fc_insert on public.forum_categories for insert with check (public.is_mod_or_admin(auth.uid()));
drop policy if exists fc_delete on public.forum_categories;
create policy fc_delete on public.forum_categories for delete using (public.is_mod_or_admin(auth.uid()));

drop policy if exists ft_read on public.forum_threads;
create policy ft_read on public.forum_threads for select using (true);
drop policy if exists ft_insert on public.forum_threads;
create policy ft_insert on public.forum_threads for insert with check (auth.uid() = author_id);
drop policy if exists ft_update on public.forum_threads;
create policy ft_update on public.forum_threads for update using (auth.uid() = author_id or public.is_mod_or_admin(auth.uid()));
drop policy if exists ft_delete on public.forum_threads;
create policy ft_delete on public.forum_threads for delete using (auth.uid() = author_id or public.is_mod_or_admin(auth.uid()));

drop policy if exists fp_read on public.forum_posts;
create policy fp_read on public.forum_posts for select using (true);
drop policy if exists fp_insert on public.forum_posts;
create policy fp_insert on public.forum_posts for insert with check (auth.uid() = author_id);
drop policy if exists fp_update on public.forum_posts;
create policy fp_update on public.forum_posts for update using (auth.uid() = author_id or public.is_mod_or_admin(auth.uid()));
drop policy if exists fp_delete on public.forum_posts;
create policy fp_delete on public.forum_posts for delete using (auth.uid() = author_id or public.is_mod_or_admin(auth.uid()));

drop policy if exists fv_read on public.forum_votes;
create policy fv_read on public.forum_votes for select using (true);
drop policy if exists fv_insert on public.forum_votes;
create policy fv_insert on public.forum_votes for insert with check (auth.uid() = user_id);
drop policy if exists fv_delete on public.forum_votes;
create policy fv_delete on public.forum_votes for delete using (auth.uid() = user_id);

drop policy if exists ftv_read on public.forum_thread_votes;
create policy ftv_read on public.forum_thread_votes for select using (true);
drop policy if exists ftv_insert on public.forum_thread_votes;
create policy ftv_insert on public.forum_thread_votes for insert with check (auth.uid() = user_id);
drop policy if exists ftv_delete on public.forum_thread_votes;
create policy ftv_delete on public.forum_thread_votes for delete using (auth.uid() = user_id);

-- ─────────────────────────── FUNCIONES RPC ───────────────────────────

-- Compra de juegos/obras: descuenta orbes al comprador y acredita al vendedor
create or replace function public.purchase_game(_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_post public.posts%rowtype;
  v_buyer public.profiles%rowtype;
  v_seller public.profiles%rowtype;
  v_seller_id uuid;
  v_price bigint;
begin
  select * into v_post from public.posts where id = _post_id and deleted_at is null;
  if not found then return jsonb_build_object('ok', false); end if;
  -- Si está en reventa, el precio y el cobrador son los del vendedor actual
  if v_post.seller_id is not null then
    v_seller_id := v_post.seller_id;
    v_price := coalesce(v_post.resale_price_orbes, 0);
  else
    v_seller_id := v_post.author_id;
    v_price := coalesce(v_post.price_orbes, 0);
  end if;
  if v_seller_id = auth.uid() then return jsonb_build_object('ok', true, 'free', true, 'paid', 0, 'already_owned', true); end if;
  if v_price <= 0 then
    -- Recolección gratuita: registra la propiedad
    if not exists (select 1 from public.game_purchases where user_id = auth.uid() and post_id = _post_id) then
      insert into public.game_purchases (user_id, post_id, price_paid) values (auth.uid(), _post_id, 0);
    end if;
    update public.posts set current_owner_id = auth.uid(), seller_id = null, updated_at = now() where id = _post_id;
    return jsonb_build_object('ok', true, 'free', true, 'paid', 0);
  end if;
  select * into v_buyer from public.profiles where id = auth.uid();
  if not found then return jsonb_build_object('ok', false); end if;
  if exists (select 1 from public.game_purchases where user_id = auth.uid() and post_id = _post_id) then
    return jsonb_build_object('ok', false, 'already_owned', true);
  end if;
  if coalesce(v_buyer.orbes, 0) < v_price then
    return jsonb_build_object('ok', false, 'paid', 0, 'balance', coalesce(v_buyer.orbes, 0));
  end if;
  update public.profiles set orbes = orbes - v_price, updated_at = now() where id = auth.uid();
  if v_seller_id is not null then
    select * into v_seller from public.profiles where id = v_seller_id;
    if found then
      update public.profiles set orbes = orbes + v_price, updated_at = now() where id = v_seller_id;
    end if;
  end if;
  -- Transferencia de propiedad en reventa: el vendedor anterior deja de ser dueño
  if v_post.seller_id is not null and v_post.seller_id <> v_post.author_id then
    delete from public.game_purchases where user_id = v_post.seller_id and post_id = _post_id;
  end if;
  insert into public.game_purchases (user_id, post_id, price_paid) values (auth.uid(), _post_id, v_price);
  insert into public.orbe_transactions (user_id, amount, kind, post_id, description)
    values (auth.uid(), -v_price, 'game_purchase', _post_id, 'Compra de juego/obra');
  if v_seller_id is not null then
    insert into public.orbe_transactions (user_id, amount, kind, post_id, description)
      values (v_seller_id, v_price, 'game_purchase', _post_id, 'Venta de juego/obra');
  end if;
  update public.posts set current_owner_id = auth.uid(), seller_id = null, updated_at = now() where id = _post_id;
  return jsonb_build_object('ok', true, 'paid', v_price, 'balance', coalesce(v_buyer.orbes, 0) - v_price);
end $$;

create or replace function public.purchase_artwork(_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.purchase_game(_post_id);
end $$;

-- Poner/retirar una obra de la galería en reventa (solo el dueño actual)
-- _price = 0 retira la obra de la venta
create or replace function public.resell_artwork(_post_id uuid, _price bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_post public.posts%rowtype;
  v_owns boolean;
begin
  select * into v_post from public.posts where id = _post_id and category = 'artwork' and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_owns := v_post.author_id = auth.uid()
    or v_post.current_owner_id = auth.uid()
    or exists (select 1 from public.game_purchases where user_id = auth.uid() and post_id = _post_id);
  if not v_owns then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  if _price is null or _price < 0 then return jsonb_build_object('ok', false, 'error', 'bad_price'); end if;
  if _price = 0 then
    update public.posts set seller_id = null, resale_price_orbes = null, updated_at = now() where id = _post_id;
    return jsonb_build_object('ok', true, 'on_sale', false);
  end if;
  update public.posts set seller_id = auth.uid(), resale_price_orbes = _price, updated_at = now() where id = _post_id;
  return jsonb_build_object('ok', true, 'on_sale', true, 'price', _price);
end $$;

-- Reclamo mensual de orbes Plus (10000/mes)
create or replace function public.claim_plus_orbes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prof public.profiles%rowtype;
  v_next timestamptz;
begin
  select * into v_prof from public.profiles where id = auth.uid();
  if not found then return jsonb_build_object('ok', false); end if;
  if v_prof.last_plus_claim_at is not null and v_prof.last_plus_claim_at > now() - interval '30 days' then
    v_next := v_prof.last_plus_claim_at + interval '30 days';
    return jsonb_build_object('ok', false, 'already_claimed', true, 'next_at', to_char(v_next, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;
  update public.profiles set orbes = orbes + 10000, last_plus_claim_at = now(), updated_at = now() where id = auth.uid();
  insert into public.orbe_transactions (user_id, amount, kind, description)
    values (auth.uid(), 10000, 'welcome_bonus', 'Reclamo mensual de orbes');
  return jsonb_build_object('ok', true, 'amount', 10000);
end $$;

-- Activar Plus durante N meses
create or replace function public.activate_plus(_months int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_exp timestamptz;
begin
  v_exp := now() + make_interval(months => greatest(1, coalesce(_months, 1)));
  update public.profiles set is_plus = true, plus_expires_at = v_exp, updated_at = now() where id = auth.uid();
  return jsonb_build_object('ok', true, 'expires_at', to_char(v_exp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end $$;

create or replace function public.can_play_game(_post_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_post public.posts%rowtype;
begin
  select * into v_post from public.posts where id = _post_id and deleted_at is null;
  if not found then return false; end if;
  if coalesce(v_post.price_orbes, 0) <= 0 or v_post.author_id = auth.uid() then return true; end if;
  return exists (select 1 from public.game_purchases where user_id = auth.uid() and post_id = _post_id);
end $$;

create or replace function public.expire_lapsed_plus()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.profiles set is_plus = false, updated_at = now()
    where is_plus = true and plus_expires_at is not null and plus_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Voto en hilo del foro (toggle)
create or replace function public.forum_vote_thread(_thread_id uuid, _user_id uuid, _vote text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing text;
  v_up int; v_down int;
begin
  select vote into v_existing from public.forum_thread_votes where thread_id = _thread_id and user_id = _user_id;
  if v_existing = _vote then
    delete from public.forum_thread_votes where thread_id = _thread_id and user_id = _user_id;
    if _vote = 'up' then update public.forum_threads set upvotes = greatest(0, upvotes - 1) where id = _thread_id;
    else update public.forum_threads set downvotes = greatest(0, downvotes - 1) where id = _thread_id; end if;
  else
    if v_existing is not null then
      delete from public.forum_thread_votes where thread_id = _thread_id and user_id = _user_id;
      if v_existing = 'up' then update public.forum_threads set upvotes = greatest(0, upvotes - 1) where id = _thread_id;
      else update public.forum_threads set downvotes = greatest(0, downvotes - 1) where id = _thread_id; end if;
    end if;
    insert into public.forum_thread_votes (thread_id, user_id, vote) values (_thread_id, _user_id, _vote);
    if _vote = 'up' then update public.forum_threads set upvotes = upvotes + 1 where id = _thread_id;
    else update public.forum_threads set downvotes = downvotes + 1 where id = _thread_id; end if;
  end if;
  select upvotes, downvotes into v_up, v_down from public.forum_threads where id = _thread_id;
  return jsonb_build_object('upvotes', v_up, 'downvotes', v_down);
end $$;

-- Voto en respuesta del foro (toggle)
create or replace function public.forum_vote_post(_post_id uuid, _user_id uuid, _vote text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing text;
  v_up int; v_down int;
begin
  select vote into v_existing from public.forum_votes where post_id = _post_id and user_id = _user_id;
  if v_existing = _vote then
    delete from public.forum_votes where post_id = _post_id and user_id = _user_id;
    if _vote = 'up' then update public.forum_posts set upvotes = greatest(0, upvotes - 1) where id = _post_id;
    else update public.forum_posts set downvotes = greatest(0, downvotes - 1) where id = _post_id; end if;
  else
    if v_existing is not null then
      delete from public.forum_votes where post_id = _post_id and user_id = _user_id;
      if v_existing = 'up' then update public.forum_posts set upvotes = greatest(0, upvotes - 1) where id = _post_id;
      else update public.forum_posts set downvotes = greatest(0, downvotes - 1) where id = _post_id; end if;
    end if;
    insert into public.forum_votes (post_id, user_id, vote) values (_post_id, _user_id, _vote);
    if _vote = 'up' then update public.forum_posts set upvotes = upvotes + 1 where id = _post_id;
    else update public.forum_posts set downvotes = downvotes + 1 where id = _post_id; end if;
  end if;
  select upvotes, downvotes into v_up, v_down from public.forum_posts where id = _post_id;
  return jsonb_build_object('upvotes', v_up, 'downvotes', v_down);
end $$;

-- Incrementar vistas de hilo
create or replace function public.forum_bump_views(_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.forum_threads set views = views + 1 where id = _thread_id;
end $$;

-- Actualizar contador y última actividad de un hilo tras una nueva respuesta
create or replace function public.forum_touch_thread(_thread_id uuid, _author text)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from public.forum_posts where thread_id = _thread_id;
  update public.forum_threads
    set post_count = v_count,
        last_post_at = now(),
        last_post_author = coalesce(_author, ''),
        updated_at = now()
    where id = _thread_id;
end $$;

-- ─────────────────────────── TRIGGER PERFIL + ADMIN ───────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  -- Genera el ID público único del usuario (AST-XXXXXX)
  loop
    v_code := 'AST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.profiles where user_code = v_code);
  end loop;
  insert into public.profiles (id, username, display_name, user_code, trust_points)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'display_name',
    v_code,
    10
  )
  on conflict (id) do nothing;
  -- Auto-asignar rol admin a las cuentas del equipo (propietaria + atlas)
  if lower(new.email) in ('linkyteam989@gmail.com', 'atlas.yt.je@gmail.com') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin'::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: perfiles y rol admin para usuarios que ya existan
insert into public.profiles (id, username)
select u.id, coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- Backfill: asigna ID público a los usuarios antiguos que no tienen uno
-- (idempotente: los que ya tienen código se ignoran).
do $$
declare
  v_row record;
  v_code text;
begin
  for v_row in select id from public.profiles where user_code is null loop
    loop
      v_code := 'AST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.profiles where user_code = v_code);
    end loop;
    update public.profiles set user_code = v_code, updated_at = now() where id = v_row.id;
  end loop;
end $$;

insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
from auth.users u
where lower(u.email) in ('linkyteam989@gmail.com', 'atlas.yt.je@gmail.com')
on conflict (user_id, role) do nothing;

-- ─────────────────────────── CATEGORÍAS DE FORO POR DEFECTO ───────────────────────────
insert into public.forum_categories (id, name, description, icon, sort_order) values
  ('00000000-0000-4000-8000-000000000001', 'General',   'Charlas, anuncios y temas generales de la comunidad', 'globe', 0),
  ('00000000-0000-4000-8000-000000000002', 'Ayuda',     'Dudas sobre el editor, scripts, física y más', 'life-buoy', 1),
  ('00000000-0000-4000-8000-000000000003', 'Showcase',  'Comparte tus juegos, arte y creaciones', 'trophy', 2),
  ('00000000-0000-4000-8000-000000000004', 'Feedback',  'Sugerencias y mejoras para Asternal', 'message-circle-more', 3),
  ('00000000-0000-4000-8000-000000000005', 'Off-Topic', 'Todo lo demás: memes, música, charla libre', 'coffee', 4)
on conflict (id) do nothing;

-- ─────────────────────────── STORAGE (BUCKET post-media) ───────────────────────────
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

drop policy if exists "post-media public read" on storage.objects;
create policy "post-media public read" on storage.objects
  for select using (bucket_id = 'post-media');
drop policy if exists "post-media authenticated upload" on storage.objects;
create policy "post-media authenticated upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'post-media');
drop policy if exists "post-media owner update" on storage.objects;
create policy "post-media owner update" on storage.objects
  for update to authenticated using (bucket_id = 'post-media');
drop policy if exists "post-media owner delete" on storage.objects;
create policy "post-media owner delete" on storage.objects
  for delete to authenticated using (bucket_id = 'post-media');

-- ════════════════════════════════════════════════════════════════════
--  HISTORIAL DE PUNTOS DE CONFIANZA
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.trust_points_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  modifier_id uuid references public.profiles(id) on delete set null,
  action     text not null check (action in ('deduct', 'restore')),
  amount     smallint not null check (amount > 0),
  reason     text not null default '',
  points_before smallint not null,
  points_after  smallint not null,
  created_at timestamptz not null default now()
);

alter table public.trust_points_history enable row level security;

create policy "Users can read own trust history" on public.trust_points_history
  for select using (auth.uid() = user_id);

create policy "Mods can read trust history for any user" on public.trust_points_history
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin', 'moderator'))
  );

create policy "Mods can insert trust history" on public.trust_points_history
  for insert with check (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin', 'moderator'))
  );

-- ════════════════════════════════════════════════════════════════════
--  ASSET PRESET DATA (editor resources sold in the Tienda)
-- ════════════════════════════════════════════════════════════════════
alter table public.posts add column if not exists asset_preset jsonb;
alter table public.posts add column if not exists post_type varchar(30) default null;

-- ════════════════════════════════════════════════════════════════════
--  FIN DEL SCRIPT
-- ════════════════════════════════════════════════════════════════════
