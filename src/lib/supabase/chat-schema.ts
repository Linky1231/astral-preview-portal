/**
 * DDL de las tablas del chat comunitario (chats / chat_members / chat_messages)
 * y de la biblioteca de stickers por cuenta (stickers).
 *
 * Este bloque es idempotente: puede ejecutarse completo o por partes, tantas
 * veces como sea necesario (create table/index if not exists + limpieza total
 * de políticas + publicación realtime protegida).
 *
 * Se usa desde:
 *  - El instalador general de esquema (setup.ts), que lo añade al SQL completo.
 *  - El panel "Instalar chat" que aparece en el chat cuando las tablas faltan.
 */
export const CHAT_SCHEMA_SQL = `-- ─────────────────────────── CHAT COMUNITARIO ───────────────────────────

create table if not exists public.chats (
  id uuid primary key,
  type text not null default 'group',
  name text not null,
  description text,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  is_community boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Descripción y foto de perfil de los chats (grupos personalizados)
alter table public.chats add column if not exists description text;
alter table public.chats add column if not exists avatar_url text;

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

-- El rol 'owner' identifica al creador de un grupo personalizado; 'admin' y
-- 'moderator' los designa el creador (permisos de administración).
-- Se recrea el CHECK para que los admita (instalaciones antiguas solo tenían
-- member/admin/owner).
alter table public.chat_members drop constraint if exists chat_members_role_check;
alter table public.chat_members add constraint chat_members_role_check check (role in ('member', 'admin', 'moderator', 'owner'));

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  media_url text,
  media_type text not null default 'image',
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  kind text not null default 'message',
  gift_id uuid,
  created_at timestamptz not null default now()
);

-- Para instalaciones previas que aún no tienen la columna (audio de voz)
alter table public.chat_messages add column if not exists media_type text not null default 'image';
-- Avisos del grupo y paquetes de regalo (añadidos tras el audio de voz)
alter table public.chat_messages add column if not exists kind text not null default 'message';
alter table public.chat_messages add column if not exists gift_id uuid;

create index if not exists chat_messages_chat_created_idx on public.chat_messages (chat_id, created_at);
create index if not exists chat_members_user_idx on public.chat_members (user_id);

-- ─────── PAQUETES DE REGALO (ORBES) ───────
-- El administrador crea un paquete con una cantidad de orbes por persona
-- (par, mínimo 100) y un número de personas que pueden abrirlo. Cuando se
-- abren todos los regalos, el paquete se cierra automáticamente.
create table if not exists public.orb_gifts (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  amount_per_person bigint not null,
  max_claims int not null,
  claims int not null default 0,
  total_orbes bigint not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table if not exists public.orb_gift_claims (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.orb_gifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (gift_id, user_id)
);

create index if not exists orb_gifts_chat_status_idx on public.orb_gifts (chat_id, status);
create index if not exists orb_gift_claims_gift_idx on public.orb_gift_claims (gift_id);

-- ─────── ENCUESTAS DEL CHAT ───────
-- El administrador de la comunidad (o el creador/administrador de un grupo
-- personalizado) crea encuestas; cualquier miembro del chat vota una vez.
-- Los resultados se agregan en el servidor (get_chat_poll) para no exponer
-- quién votó a qué.
alter table public.chat_messages add column if not exists poll_id uuid;

create table if not exists public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  options text[] not null,
  multiple boolean not null default false,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

create index if not exists chat_polls_chat_idx on public.chat_polls (chat_id);
create index if not exists chat_poll_votes_poll_idx on public.chat_poll_votes (poll_id);

-- Caducidad de paquetes de regalo (para tablas creadas antes de esta función).
alter table public.orb_gifts add column if not exists expires_at timestamptz not null default now() + interval '24 hours';

-- ─────── BIBLIOTECA DE STICKERS POR CUENTA ───────
-- Cada usuario guarda sus propios stickers; persisten entre sesiones y
-- dispositivos. Solo el dueño puede verlos, añadirlos y eliminarlos.
create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

create index if not exists stickers_user_idx on public.stickers (user_id);

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.stickers enable row level security;
alter table public.orb_gifts enable row level security;
alter table public.orb_gift_claims enable row level security;
alter table public.chat_polls enable row level security;
alter table public.chat_poll_votes enable row level security;

-- Limpieza total: elimina CUALQUIER política previa de las tablas del chat,
-- incluidas las de instalaciones antiguas con otros nombres que provocan el
-- error «infinite recursion detected in policy for relation chat_members».
-- Después se recrean abajo las políticas definitivas.
do $$
declare _t text;
declare _p record;
begin
  for _t in select unnest(array['chats', 'chat_members', 'chat_messages', 'stickers', 'orb_gifts', 'orb_gift_claims', 'chat_polls', 'chat_poll_votes']) loop
    for _p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = _t
    loop
      execute format('drop policy if exists %I on public.%I', _p.policyname, _t);
    end loop;
  end loop;
end $$;

-- chats: lectura pública, creación por el propio usuario
create policy chats_read on public.chats for select using (true);
create policy chats_insert on public.chats for insert with check (auth.uid() = created_by);

-- chat_members: lectura pública, cada usuario se añade/elimina a sí mismo
create policy chat_members_read on public.chat_members for select using (true);
create policy chat_members_self_insert on public.chat_members for insert with check (auth.uid() = user_id);
create policy chat_members_self_delete on public.chat_members for delete using (auth.uid() = user_id);

-- chat_messages: el chat COMUNITARIO es de lectura pública; los chats
-- individuales (dm) y los grupos PERSONALIZADOS solo los leen sus miembros.
create policy chat_messages_read on public.chat_messages for select using (
  exists (select 1 from public.chats c where c.id = chat_messages.chat_id and c.is_community)
  or exists (select 1 from public.chat_members m
             where m.chat_id = chat_messages.chat_id and m.user_id = auth.uid())
);
create policy chat_messages_insert on public.chat_messages for insert with check (auth.uid() = sender_id);
create policy chat_messages_update on public.chat_messages for update using (auth.uid() = sender_id);
create policy chat_messages_delete on public.chat_messages for delete using (auth.uid() = sender_id);

-- stickers: biblioteca privada de cada cuenta
create policy stickers_select on public.stickers for select using (auth.uid() = user_id);
create policy stickers_insert on public.stickers for insert with check (auth.uid() = user_id);
create policy stickers_delete on public.stickers for delete using (auth.uid() = user_id);

-- orb_gifts: lectura pública (el estado del paquete lo ve todo el chat).
-- La creación y las aperturas van SOLO por funciones RPC (la seguridad real
-- está en el servidor: solo el administrador crea; cualquiera abre una vez).
create policy orb_gifts_read on public.orb_gifts for select using (true);

-- orb_gift_claims: cada usuario solo ve sus propios registros.
create policy orb_gift_claims_read on public.orb_gift_claims for select using (auth.uid() = user_id);

-- chat_polls: lectura para los miembros del chat (la escritura va SOLO por
-- RPC, donde se comprueba que sea el admin de la comunidad o el creador o
-- administrador del grupo).
create policy chat_polls_read on public.chat_polls for select using (
  exists (select 1 from public.chats c where c.id = chat_polls.chat_id and c.is_community)
  or exists (select 1 from public.chat_members m
             where m.chat_id = chat_polls.chat_id and m.user_id = auth.uid())
);

-- chat_poll_votes: cada usuario solo ve sus propios votos.
create policy chat_poll_votes_read on public.chat_poll_votes for select using (auth.uid() = user_id);

-- ─────── CHATS INDIVIDUALES (DMs) ───────
-- Reutilizan chats (type='dm'), chat_members (los 2 participantes) y
-- chat_messages. last_read_at guarda hasta dónde ha leído cada participante
-- para calcular los no leídos de cada conversación.
alter table public.chat_members add column if not exists last_read_at timestamptz;

-- ¿a y b se siguen mutuamente?
create or replace function public.are_mutual(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows where follower_id = a and following_id = b)
     and exists (select 1 from public.follows where follower_id = b and following_id = a)
$$;

-- Devuelve (o crea) el chat individual con _other_id. Solo se permite si se
-- siguen mutuamente. Crea el chat tipo 'dm' y añade a ambos como miembros.
create or replace function public.get_or_create_dm(_other_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_chat_id uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para chatear');
  end if;
  if v_me = _other_id then
    return jsonb_build_object('ok', false, 'error', 'No puedes chatear contigo mismo');
  end if;
  if not public.are_mutual(v_me, _other_id) then
    return jsonb_build_object('ok', false, 'error', 'Solo puedes chatear con personas que te siguen mutuamente');
  end if;
  -- Buscar un chat dm existente con ambos miembros (el tipo válido en la
  -- tabla chats es 'direct', definido por su CHECK constraint)
  select c.id into v_chat_id
  from public.chats c
  join public.chat_members a on a.chat_id = c.id and a.user_id = v_me
  join public.chat_members b on b.chat_id = c.id and b.user_id = _other_id
  where c.type = 'direct'
  limit 1;
  if v_chat_id is null then
    insert into public.chats (type, name, created_by, is_community)
    values ('direct', 'Chat individual', v_me, false)
    returning id into v_chat_id;
    insert into public.chat_members (chat_id, user_id, role) values
      (v_chat_id, v_me, 'member'),
      (v_chat_id, _other_id, 'member');
  end if;
  return jsonb_build_object('ok', true, 'chat_id', v_chat_id);
end $$;

-- Lista mis chats individuales: perfil del otro, último mensaje y no leídos.
create or replace function public.my_dm_chats()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'last_at' desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'chat_id', c.id,
      'other', (select to_jsonb(p) from public.profiles p where p.id = (
        select m.user_id from public.chat_members m
        where m.chat_id = c.id and m.user_id <> auth.uid() limit 1
      )),
      'last_message', (select to_jsonb(msg) from public.chat_messages msg
        where msg.chat_id = c.id order by msg.created_at desc limit 1),
      'last_at', (select max(msg.created_at) from public.chat_messages msg where msg.chat_id = c.id),
      'unread', (select count(*) from public.chat_messages msg
        where msg.chat_id = c.id and msg.sender_id <> auth.uid()
          and (msg.created_at > coalesce(
            (select m.last_read_at from public.chat_members m
             where m.chat_id = c.id and m.user_id = auth.uid()),
            'epoch'::timestamptz)))
    ) x
    from public.chats c
    join public.chat_members cm on cm.chat_id = c.id and cm.user_id = auth.uid()
    where c.type = 'direct'
  ) t
$$;

-- Perfiles con los que me sigo mutuamente (para el apartado de DMs).
create or replace function public.my_mutual_follows()
returns setof public.profiles language sql stable security definer set search_path = public as $$
  select p.* from public.profiles p
  where public.are_mutual(auth.uid(), p.id)
$$;

-- Marca como leído un chat individual (actualiza last_read_at del participante).
create or replace function public.mark_dm_read(_chat_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.chat_members set last_read_at = now()
  where chat_id = _chat_id and user_id = auth.uid();
$$;

-- ─────── GRUPOS PERSONALIZADOS ───────
-- Chats grupales que cualquier usuario puede crear con amigos que se siguen
-- mutuamente. Tienen nombre, descripción y foto de perfil (avatar_url). El
-- creador es el owner; puede editar el grupo y añadir/quitar miembros.

-- Crea un grupo personalizado con los amigos indicados. Solo se admiten
-- personas con las que te sigues mutuamente (máximo 50 miembros). El creador
-- entra como 'owner'.
create or replace function public.create_group_chat(
  _name text,
  _description text,
  _avatar_url text,
  _member_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_chat_id uuid;
  v_m uuid;
  v_count int := 0;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para crear un grupo');
  end if;
  if _name is null or length(trim(_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Ponle un nombre al grupo');
  end if;
  if _member_ids is null or array_length(_member_ids, 1) is null or array_length(_member_ids, 1) < 1 then
    return jsonb_build_object('ok', false, 'error', 'Elige al menos un amigo');
  end if;
  if array_length(_member_ids, 1) > 50 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 50 miembros por grupo');
  end if;

  insert into public.chats (type, name, description, avatar_url, created_by, is_community)
  values ('group', trim(_name), coalesce(_description, ''), _avatar_url, v_me, false)
  returning id into v_chat_id;

  insert into public.chat_members (chat_id, user_id, role)
  values (v_chat_id, v_me, 'owner');

  for v_m in select distinct unnest(_member_ids) loop
    if v_m = v_me then continue; end if;
    -- Solo amigos con seguimiento mutuo.
    if public.are_mutual(v_me, v_m) then
      insert into public.chat_members (chat_id, user_id, role)
      values (v_chat_id, v_m, 'member')
      on conflict (chat_id, user_id) do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count = 0 then
    -- No se pudo añadir a nadie: deshacemos el grupo.
    delete from public.chats where id = v_chat_id;
    return jsonb_build_object('ok', false, 'error', 'Ninguno de los elegidos es un amigo con seguimiento mutuo');
  end if;

  return jsonb_build_object('ok', true, 'chat_id', v_chat_id, 'members', v_count + 1);
end $$;

-- Lista mis grupos personalizados (no la comunidad): nombre, foto,
-- descripción, nº de miembros, último mensaje y no leídos.
create or replace function public.my_group_chats()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'last_at' desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'chat_id', c.id,
      'name', c.name,
      'description', c.description,
      'avatar_url', c.avatar_url,
      'created_by', c.created_by,
      'my_role', (select m.role from public.chat_members m
        where m.chat_id = c.id and m.user_id = auth.uid()),
      'member_count', (select count(*) from public.chat_members m where m.chat_id = c.id),
      'last_message', (select to_jsonb(msg) from public.chat_messages msg
        where msg.chat_id = c.id order by msg.created_at desc limit 1),
      'last_at', (select max(msg.created_at) from public.chat_messages msg where msg.chat_id = c.id),
      'unread', (select count(*) from public.chat_messages msg
        where msg.chat_id = c.id and msg.sender_id <> auth.uid()
          and (msg.created_at > coalesce(
            (select m.last_read_at from public.chat_members m
             where m.chat_id = c.id and m.user_id = auth.uid()),
            'epoch'::timestamptz)))
    ) x
    from public.chats c
    join public.chat_members cm on cm.chat_id = c.id and cm.user_id = auth.uid()
    where c.type = 'group' and not c.is_community
  ) t
$$;

-- Miembros de un grupo personalizado (con su perfil completo).
create or replace function public.group_members(_chat_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile', to_jsonb(p),
    'role', m.role,
    'joined_at', m.joined_at
  ) order by (m.role = 'owner') desc, p.display_name), '[]'::jsonb)
  from public.chat_members m
  join public.profiles p on p.id = m.user_id
  where m.chat_id = _chat_id
$$;

-- Edita el nombre / descripción / foto de un grupo (solo el owner).
create or replace function public.update_group_chat(
  _chat_id uuid,
  _name text,
  _description text,
  _avatar_url text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión');
  end if;
  select role into v_role from public.chat_members where chat_id = _chat_id and user_id = v_me;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Solo el creador del grupo puede editarlo');
  end if;
  if _name is null or length(trim(_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Ponle un nombre al grupo');
  end if;
  update public.chats
  set name = trim(_name),
      description = coalesce(_description, ''),
      avatar_url = _avatar_url,
      updated_at = now()
  where id = _chat_id;
  return jsonb_build_object('ok', true);
end $$;

-- Añade un miembro a un grupo personalizado (solo el owner y si se siguen
-- mutuamente).
create or replace function public.add_group_member(_chat_id uuid, _user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión');
  end if;
  select role into v_role from public.chat_members where chat_id = _chat_id and user_id = v_me;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Solo el creador del grupo puede añadir miembros');
  end if;
  if _user_id = v_me then
    return jsonb_build_object('ok', false, 'error', 'Ya eres miembro');
  end if;
  if not public.are_mutual(v_me, _user_id) then
    return jsonb_build_object('ok', false, 'error', 'Solo puedes añadir a personas que se siguen mutuamente contigo');
  end if;
  insert into public.chat_members (chat_id, user_id, role)
  values (_chat_id, _user_id, 'member')
  on conflict (chat_id, user_id) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Quita a un miembro de un grupo (el creador o un administrador; nunca al creador).
create or replace function public.remove_group_member(_chat_id uuid, _user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión');
  end if;
  select role into v_role from public.chat_members where chat_id = _chat_id and user_id = v_me;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el creador o un administrador puede quitar miembros');
  end if;
  if _user_id = v_me then
    return jsonb_build_object('ok', false, 'error', 'No puedes salir usando esta opción');
  end if;
  if (select role from public.chat_members where chat_id = _chat_id and user_id = _user_id) = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'No puedes quitar al creador del grupo');
  end if;
  delete from public.chat_members where chat_id = _chat_id and user_id = _user_id;
  return jsonb_build_object('ok', true);
end $$;

-- Sale del grupo (cualquier miembro, incluyendo el owner). Si el owner sale,
-- el grupo pasa a otro miembro o se elimina si queda vacío.
create or replace function public.leave_group_chat(_chat_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_count int;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión');
  end if;
  delete from public.chat_members where chat_id = _chat_id and user_id = v_me;
  -- ¿Queda alguien? Si no, el grupo desaparece (con sus mensajes en cascada).
  select count(*) into v_count from public.chat_members where chat_id = _chat_id;
  if v_count = 0 then
    delete from public.chats where id = _chat_id;
  else
    -- Si era el owner, el primer miembro pasa a ser el nuevo owner.
    update public.chat_members
    set role = 'owner'
    where chat_id = _chat_id
      and user_id = (select user_id from public.chat_members
                     where chat_id = _chat_id order by joined_at limit 1);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─────── RPC: AVISOS Y REGALOS ───────
-- ¿El usuario conectado es administrador de la comunidad? Lo son la cuenta
-- propietaria (linkyteam989@gmail.com) y cualquier cuenta con el rol admin
-- (p. ej. atlas.yt.je@gmail.com, al que handle_new_user ya le asigna ese rol).
-- Así la UI (que deja pasar a los admins con isAdmin()) y el servidor coinciden.
create or replace function public.is_owner_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'linkyteam989@gmail.com'
      or exists (
        select 1 from public.user_roles r
        where r.user_id = auth.uid()
          and r.role = 'admin'::public.app_role
      )
$$;

-- Publica un aviso del grupo, destacado y visible para todos. En la comunidad
-- solo los administradores (la cuenta propietaria y el rol admin); en un grupo
-- personalizado, el creador, los administradores o los moderadores.
create or replace function public.create_announcement(_chat_id uuid, _content text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_role text;
  v_community boolean;
  v_msg jsonb;
begin
  if v_admin is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para publicar avisos');
  end if;
  if _content is null or length(trim(_content)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'El aviso no puede estar vacío');
  end if;
  select is_community into v_community from public.chats where id = _chat_id;
  if v_community is null then
    return jsonb_build_object('ok', false, 'error', 'El chat no existe');
  end if;
  if v_community then
    if not public.is_owner_admin() then
      return jsonb_build_object('ok', false, 'error', 'Solo el administrador puede publicar avisos');
    end if;
  else
    select role into v_role from public.chat_members where chat_id = _chat_id and user_id = v_admin;
    if v_role not in ('owner', 'admin', 'moderator') then
      return jsonb_build_object('ok', false, 'error', 'Solo el creador, un administrador o un moderador del grupo puede publicar avisos');
    end if;
  end if;
  insert into public.chat_messages (chat_id, sender_id, content, kind)
    values (_chat_id, v_admin, trim(_content), 'announcement')
    returning to_jsonb(chat_messages) into v_msg;
  return jsonb_build_object('ok', true, 'message', v_msg);
end $$;  -- Crea un paquete de regalos de orbes en el chat (cualquier usuario con
  -- saldo suficiente). Descuenta el total (cantidad x personas) de los orbes
  -- del creador al instante.
create or replace function public.create_orb_gift(_chat_id uuid, _title text, _amount_per_person bigint, _max_claims int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_total bigint;
  v_gift_id uuid;
  v_balance bigint;
  v_msg jsonb;
begin
  if v_admin is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para crear regalos');
  end if;
  if _amount_per_person is null or _amount_per_person < 100 or mod(_amount_per_person, 2) <> 0 then
    return jsonb_build_object('ok', false, 'error', 'La cantidad por persona debe ser par y de mínimo 100 orbes');
  end if;
  if _max_claims is null or _max_claims < 1 or _max_claims > 1000 then
    return jsonb_build_object('ok', false, 'error', 'La cantidad de personas debe estar entre 1 y 1000');
  end if;
  v_total := _amount_per_person * _max_claims;
  select coalesce(orbes, 0) into v_balance from public.profiles where id = v_admin;
  if v_balance < v_total then
    return jsonb_build_object('ok', false, 'error',
      'No tienes suficientes orbes: necesitas ' || v_total || ' y tienes ' || v_balance);
  end if;
  update public.profiles set orbes = orbes - v_total, updated_at = now() where id = v_admin;
  insert into public.orbe_transactions (user_id, amount, kind, description)
    values (v_admin, -v_total, 'adjustment', 'Paquete de regalos: ' || coalesce(nullif(trim(_title), ''), 'Regalo comunitario'));
  insert into public.orb_gifts (chat_id, created_by, amount_per_person, max_claims, total_orbes, expires_at)
    values (_chat_id, v_admin, _amount_per_person, _max_claims, v_total, now() + interval '24 hours')
    returning id into v_gift_id;
  insert into public.chat_messages (chat_id, sender_id, content, kind, gift_id)
    values (_chat_id, v_admin, coalesce(nullif(trim(_title), ''), '¡Hay regalos para la comunidad! 🎁'), 'gift', v_gift_id)
    returning to_jsonb(chat_messages) into v_msg;
  return jsonb_build_object('ok', true, 'gift_id', v_gift_id, 'total', v_total, 'message', v_msg);
end $$;

-- Abre un regalo: reserva un hueco del paquete, acredita los orbes al usuario
-- y cierra el paquete con su animación cuando se llenan todos los huecos.
create or replace function public.claim_orb_gift(_gift_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_row public.orb_gifts%rowtype;
  v_closed boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para abrir el regalo');
  end if;
  select * into v_row from public.orb_gifts where id = _gift_id;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'El paquete de regalos no existe');
  end if;
  if v_row.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'Este paquete ya se cerró');
  end if;
  if exists (select 1 from public.orb_gift_claims where gift_id = _gift_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'Ya abriste este regalo');
  end if;
  -- Reserva atómica del hueco: solo se concede si aún quedan plazas.
  update public.orb_gifts set claims = claims + 1
  where id = _gift_id and status = 'open' and claims < max_claims
  returning * into v_row;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'El paquete ya se llenó y se cerró');
  end if;
  if v_row.claims >= v_row.max_claims then
    update public.orb_gifts set status = 'closed', closed_at = now()
    where id = _gift_id;
    v_closed := true;
  end if;
  insert into public.orb_gift_claims (gift_id, user_id) values (_gift_id, v_user);
  update public.profiles set orbes = orbes + v_row.amount_per_person, updated_at = now()
  where id = v_user;
  insert into public.orbe_transactions (user_id, amount, kind, description)
    values (v_user, v_row.amount_per_person, 'adjustment', 'Regalo de la comunidad');
  return jsonb_build_object('ok', true, 'amount', v_row.amount_per_person, 'claims', v_row.claims, 'closed', v_closed);
end $$;

-- Estado actual de un paquete de regalo (para la tarjeta del chat).
create or replace function public.get_orb_gift(_gift_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', g.id,
    'chat_id', g.chat_id,
    'created_by', g.created_by,
    'amount_per_person', g.amount_per_person,
    'max_claims', g.max_claims,
    'claims', g.claims,
    'total_orbes', g.total_orbes,
    'status', g.status,
    'created_at', g.created_at,
    'closed_at', g.closed_at,
    'expires_at', g.expires_at,
    'claimed_by_me', exists (select 1 from public.orb_gift_claims c where c.gift_id = g.id and c.user_id = auth.uid())
  )
  from public.orb_gifts g
  where g.id = _gift_id
$$;

-- Caducidad: si en 24 horas el paquete no se llenó, se cierra y se devuelven
-- al creador los orbes que nadie reclamó (con su registro de transacción).
create or replace function public.expire_orb_gifts()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_gift record;
  v_claimed bigint;
  v_unclaimed bigint;
  v_count int := 0;
begin
  for v_gift in
    select id, created_by, total_orbes from public.orb_gifts
    where status = 'open' and expires_at < now()
  loop
    select count(*) into v_claimed
    from public.orb_gift_claims where gift_id = v_gift.id;
    v_unclaimed := greatest(v_gift.total_orbes - v_claimed * (select amount_per_person from public.orb_gifts where id = v_gift.id), 0);

    update public.orb_gifts
    set status = 'expired', closed_at = now()
    where id = v_gift.id and status = 'open';

    if v_unclaimed > 0 then
      update public.profiles
      set orbes = orbes + v_unclaimed, updated_at = now()
      where id = v_gift.created_by;
      insert into public.orbe_transactions (user_id, amount, kind, description)
        values (v_gift.created_by, v_unclaimed, 'refund',
          'Reembolso de paquete de regalos caducado (' || v_unclaimed || ' orbes sin reclamar)');
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ─────── RPC: ENCUESTAS Y ADMINISTRACIÓN DE GRUPOS ───────

-- Crea una encuesta y publica el mensaje 'poll' en el chat (solo el admin de
-- la comunidad o el creador/administrador de un grupo personalizado).
create or replace function public.create_chat_poll(
  _chat_id uuid,
  _question text,
  _options text[],
  _multiple boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role text;
  v_community boolean;
  v_poll_id uuid;
  v_msg jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para crear encuestas');
  end if;
  if _question is null or length(trim(_question)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Escribe una pregunta para la encuesta');
  end if;
  if _options is null or array_length(_options, 1) < 2 or array_length(_options, 1) > 10 then
    return jsonb_build_object('ok', false, 'error', 'La encuesta necesita entre 2 y 10 opciones');
  end if;
  select is_community into v_community from public.chats where id = _chat_id;
  if v_community is null then
    return jsonb_build_object('ok', false, 'error', 'El chat no existe');
  end if;
  if v_community then
    if not public.is_owner_admin() then
      return jsonb_build_object('ok', false, 'error', 'Solo el administrador de la comunidad puede crear encuestas');
    end if;
  else
    select role into v_role from public.chat_members where chat_id = _chat_id and user_id = v_me;
    if v_role not in ('owner', 'admin') then
      return jsonb_build_object('ok', false, 'error', 'Solo el creador o un administrador del grupo puede crear encuestas');
    end if;
  end if;
  insert into public.chat_polls (chat_id, created_by, question, options, multiple)
    values (_chat_id, v_me, trim(_question), _options, coalesce(_multiple, false))
    returning id into v_poll_id;
  insert into public.chat_messages (chat_id, sender_id, content, kind, poll_id)
    values (_chat_id, v_me, trim(_question), 'poll', v_poll_id)
    returning to_jsonb(chat_messages) into v_msg;
  return jsonb_build_object('ok', true, 'poll_id', v_poll_id, 'message', v_msg);
end $$;

-- Vota (o cambia el voto) en una encuesta abierta. Solo una vez por persona.
create or replace function public.vote_chat_poll(_poll_id uuid, _option_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_poll public.chat_polls%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión para votar');
  end if;
  select * into v_poll from public.chat_polls where id = _poll_id;
  if v_poll.id is null then
    return jsonb_build_object('ok', false, 'error', 'La encuesta no existe');
  end if;
  if v_poll.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'Esta encuesta ya está cerrada');
  end if;
  if _option_index is null or _option_index < 0 or _option_index >= array_length(v_poll.options, 1) then
    return jsonb_build_object('ok', false, 'error', 'Opción no válida');
  end if;
  -- Solo miembros (la comunidad es pública y todos están dentro).
  if not exists (select 1 from public.chat_members m
                 where m.chat_id = v_poll.chat_id and m.user_id = v_me)
     and v_poll.chat_id <> 'c0000000-0000-4000-8000-000000000000' then
    return jsonb_build_object('ok', false, 'error', 'No eres miembro de este chat');
  end if;
  insert into public.chat_poll_votes (poll_id, user_id, option_index)
    values (_poll_id, v_me, _option_index)
  on conflict (poll_id, user_id)
    do update set option_index = excluded.option_index, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Cierra una encuesta (el creador, el admin de la comunidad o el creador o
-- administrador del grupo). Al cerrarse ya no se puede votar.
create or replace function public.close_chat_poll(_poll_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_poll public.chat_polls%rowtype;
  v_role text;
  v_community boolean;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión');
  end if;
  select * into v_poll from public.chat_polls where id = _poll_id;
  if v_poll.id is null then
    return jsonb_build_object('ok', false, 'error', 'La encuesta no existe');
  end if;
  if v_poll.created_by <> v_me then
    select is_community into v_community from public.chats where id = v_poll.chat_id;
    if v_community then
      if not public.is_owner_admin() then
        return jsonb_build_object('ok', false, 'error', 'Solo el administrador puede cerrar esta encuesta');
      end if;
    else
      select role into v_role from public.chat_members where chat_id = v_poll.chat_id and user_id = v_me;
      if v_role not in ('owner', 'admin') then
        return jsonb_build_object('ok', false, 'error', 'Solo el creador o un administrador puede cerrar la encuesta');
      end if;
    end if;
  end if;
  update public.chat_polls set status = 'closed', closed_at = now(), updated_at = now()
  where id = _poll_id;
  return jsonb_build_object('ok', true);
end $$;

-- Estado de una encuesta con el recuento de votos agregado (sin exponer el
-- voto individual de cada usuario).
create or replace function public.get_chat_poll(_poll_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'chat_id', p.chat_id,
    'created_by', p.created_by,
    'question', p.question,
    'options', p.options,
    'multiple', p.multiple,
    'status', p.status,
    'created_at', p.created_at,
    'closed_at', p.closed_at,
    'votes', (select coalesce(jsonb_agg(jsonb_build_object('option_index', v.option_index, 'count', v.c)), '[]'::jsonb)
              from (select option_index, count(*) as c
                    from public.chat_poll_votes v
                    where v.poll_id = p.id
                    group by option_index) v),
    'total_votes', (select count(*) from public.chat_poll_votes v where v.poll_id = p.id),
    'my_votes', (select coalesce(jsonb_agg(option_index), '[]'::jsonb)
                from public.chat_poll_votes v
                where v.poll_id = p.id and v.user_id = auth.uid())
  )
  from public.chat_polls p
  where p.id = _poll_id
$$;

-- Los votos nuevos 'tocan' la encuesta (updated_at) para que el realtime avise
-- a todos y los resultados se actualicen en vivo.
create or replace function public.touch_chat_poll()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid := coalesce(new.poll_id, old.poll_id);
begin
  if v_pid is not null then
    update public.chat_polls set updated_at = now() where id = v_pid;
  end if;
  return new;
end $$;
drop trigger if exists chat_poll_votes_touch on public.chat_poll_votes;
create trigger chat_poll_votes_touch
  after insert or update or delete on public.chat_poll_votes
  for each row execute function public.touch_chat_poll();

-- El creador designa administradores y moderadores. Los administradores
-- pueden eliminar el grupo, publicar avisos y gestionar miembros.
create or replace function public.set_group_role(_chat_id uuid, _user_id uuid, _role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role text;
  v_target text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión');
  end if;
  if _role not in ('admin', 'moderator', 'member') then
    return jsonb_build_object('ok', false, 'error', 'Rol no válido');
  end if;
  if _user_id = v_me then
    return jsonb_build_object('ok', false, 'error', 'No puedes cambiar tu propio rol');
  end if;
  select role into v_role from public.chat_members where chat_id = _chat_id and user_id = v_me;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Solo el creador del grupo puede gestionar administradores');
  end if;
  select role into v_target from public.chat_members where chat_id = _chat_id and user_id = _user_id;
  if v_target is null then
    return jsonb_build_object('ok', false, 'error', 'Ese usuario no es miembro del grupo');
  end if;
  if v_target = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'No puedes cambiar el rol del creador');
  end if;
  update public.chat_members set role = _role where chat_id = _chat_id and user_id = _user_id;
  return jsonb_build_object('ok', true);
end $$;

-- Elimina el grupo y todo su contenido (mensajes, encuestas, miembros) en
-- cascada. Solo el creador o un administrador.
create or replace function public.delete_group_chat(_chat_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión');
  end if;
  select role into v_role from public.chat_members where chat_id = _chat_id and user_id = v_me;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el creador o un administrador puede eliminar el grupo');
  end if;
  delete from public.chats where id = _chat_id;
  return jsonb_build_object('ok', true);
end $$;

-- Realtime: los mensajes nuevos llegan al instante a todos los clientes conectados.
-- Se protege por si la publicación ya existe o el proyecto no la tiene.
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chats;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.orb_gifts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_polls;
  exception when duplicate_object then null;
  end;
exception when undefined_object then
  null;
end $$;
`;
