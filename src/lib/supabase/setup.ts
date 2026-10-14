/**
 * Auto-instalación del esquema Supabase.
 * Con la URL + anon key la app funciona; este módulo permite crear el esquema
 * (tablas, RLS, funciones, bucket, triggers) automáticamente desde el navegador
 * usando la Management API de Supabase con un token de acceso personal (sbp_...).
 *
 * Las credenciales se leen de forma dinámica (override en localStorage o
 * variables de entorno inyectadas al compilar), por lo que el usuario puede
 * pegarlas directamente en el diálogo si el entorno no las inyecta.
 */
import { supabase, getSupabaseUrl, getSupabaseAnonKey } from "@/integrations/supabase/client";
// Importa el script SQL completo como texto crudo (Vite ?raw)
import schemaSql from "../../../supabase-setup.sql?raw";
import { CHAT_SCHEMA_SQL } from "./chat-schema";

/**
 * Token de acceso personal de Supabase (sbp_...).
 * Se lee de las variables del proyecto en orden:
 *   V3 (variable personalizada del tab Keys) → VITE_SUPABASE_ACCESS_TOKEN
 */
export const SUPABASE_ACCESS_TOKEN = import.meta.env.VITE_SUPABASE_ACCESS_TOKEN as string | undefined;

export { getSupabaseUrl, getSupabaseAnonKey };

/** El script SQL completo del esquema (para copiar en el SQL Editor). */
export function getSchemaSql(): string {
  return schemaSql + "\n\n" + CHAT_SCHEMA_SQL;
}

/**
 * Divide el script en bloques pequeños (~secciones naturales del archivo).
 * El script es idempotente, por lo que puede ejecutarse completo o por partes.
 */
export function getSchemaSqlBlocks(): { title: string; sql: string }[] {
  const lines = schemaSql.split("\n");
  // Líneas (1-based) donde empieza cada gran sección: PROFILES, POLLS, FOLLOWS,
  // RLS POLICIES, FUNCIONES RPC, TRIGGER. Si el archivo cambia, el fallback
  // devuelve un único bloque con todo el SQL.
  const cutLines = [86, 388, 576, 746, 782, 791].filter(c => c > 0 && c < lines.length);
  if (!cutLines.length) return [{ title: "Bloque 1 · Todo el esquema", sql: schemaSql }];

  const ranges: [number, number][] = [];
  let start = 0;
  for (const c of cutLines) {
    ranges.push([start, c - 1]);
    start = c - 1;
  }
  ranges.push([start, lines.length]);

  return ranges.map(([s, e], i) => {
    const part = lines.slice(s, e);
    const isLast = i === ranges.length - 1;
    const sql = part.join("\n") + (isLast ? "\n\n" + CHAT_SCHEMA_SQL : "");
    const names = part
      .filter(l => /^--\s*─/.test(l))
      .map(l => (l.match(/──\s*(.+?)\s*──/) ?? [null, ""])[1])
      .filter(Boolean)
      .slice(0, 3);
    return {
      title: `Bloque ${i + 1}${names.length ? " · " + names.join(", ") : ""}`,
      sql,
    };
  });
}

/** Enlace directo al SQL Editor del proyecto (para pegar el script). */
export function sqlEditorUrl(url: string): string | null {
  const ref = projectRefFromUrl(url);
  return ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : null;
}

/** ¿Está configurado el modo real (URL + anon key)? */
export function hasSupabaseConfig(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/** Extrae el project ref de una URL tipo https://xxxx.supabase.co */
export function projectRefFromUrl(url: string): string | null {
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : null;
}

/**
 * Comprueba si el esquema existe. Verifica cuatro tablas clave: `posts` (creada
 * al inicio del script), `user_projects` (guarda la sincronización de proyectos
 * entre dispositivos), `forum_categories` (casi al final) y `game_plays` (el
 * ranking de «más jugados», añadida después de la primera instalación — sin
 * ella el ranking solo cuenta jugadas del navegador y no sincroniza).
 * Detecta tanto esquemas inexistentes como instalaciones parciales/antiguas.
 */
export async function checkSchemaReady(): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  try {
    const { error } = await supabase.from("posts").select("id").limit(1);
    if (error) return false;
    // Sin user_projects los juegos no se respaldan en la nube (la sincronización
    // entre dispositivos falla en silencio) aunque el resto de la plataforma
    // funcione: se considera instalación incompleta.
    const { error: err2 } = await supabase.from("user_projects").select("id").limit(1);
    if (err2) return false;
    const { error: err3 } = await supabase.from("forum_categories").select("id").limit(1);
    if (err3) return false;
    // Sin game_plays el ranking de «más jugados (24h)» no se sincroniza entre
    // dispositivos: la instalación está incompleta aunque el resto funcione.
    const { error: err4 } = await supabase.from("game_plays").select("id").limit(1);
    return !err4;
  } catch {
    return false;
  }
}

export type SetupResult = { ok: boolean; message: string };

/**
 * Ejecuta un script SQL en el proyecto vía Management API.
 * @param accessToken Token de acceso personal de Supabase (sbp_...).
 * @param sql Script SQL a ejecutar.
 */
async function runSqlOnProject(accessToken: string, sql: string): Promise<SetupResult> {
  const url = getSupabaseUrl();
  if (!url) return { ok: false, message: "Falta la URL de Supabase. Pégala en el paso anterior o añádela en Keys (VITE_SUPABASE_URL)." };
  const ref = projectRefFromUrl(url);
  if (!ref) return { ok: false, message: "No se pudo extraer el project ref de la URL." };
  const token = accessToken.trim();
  if (!token.startsWith("sbp_")) {
    return { ok: false, message: "El token debe empezar por sbp_ (token de acceso personal)." };
  }

  const body = JSON.stringify({ query: sql, read_only: false, parameters: [] });
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // 1) Ruta por el proxy del dev server (mismo origen → sin CORS).
  //    Disponible cuando la app corre sobre el dev server de Vite.
  // 2) Ruta directa a la Management API (solo funciona si el origen está
  //    permitido por Supabase; en general dará error CORS desde el navegador).
  const routes: { url: string; viaProxy: boolean }[] = [
    { url: `/__supabase-mgmt/projects/${ref}/database/query`, viaProxy: true },
    { url: `https://api.supabase.com/v1/projects/${ref}/database/query`, viaProxy: false },
  ];

  let lastError = "";
  for (const route of routes) {
    try {
      const res = await fetch(route.url, { method: "POST", headers, body });
      const text = await res.text();
      // El proxy del dev server devuelve el HTML de la app (200) si la ruta no
      // se reenvía (p. ej. en build estático). Si no es JSON, ignoramos la ruta.
      const looksJson = text.trim().startsWith("{") || text.trim().startsWith("[");
      if (!looksJson) {
        lastError = "La ruta no devolvió JSON (proxy no disponible).";
        continue;
      }
      if (!res.ok) {
        let msg = text;
        try { msg = (JSON.parse(text) as { message?: string })?.message ?? text; } catch { /* noop */ }
        return { ok: false, message: msg.slice(0, 500) };
      }
      return { ok: true, message: "Esquema creado correctamente. Ya puedes usar la plataforma." };
    } catch (e) {
      const err = e as Error;
      const msg = err?.message ?? "Error desconocido";
      if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)) {
        lastError = "Bloqueo CORS de Supabase en esta ruta.";
      } else {
        lastError = msg;
      }
    }
  }

  return {
    ok: false,
    message:
      "No se pudo ejecutar el SQL desde el navegador (" + lastError + "). " +
      "Usa la opción 'Copiar SQL' y pégalo en el SQL Editor de tu proyecto, o ejecuta la app desde el dev server para que el botón automático funcione.",
  };
}

/**
 * Ejecuta todo el script SQL (esquema completo) vía Management API.
 * @param accessToken Token de acceso personal de Supabase (sbp_...).
 */
export async function runSchemaSetup(accessToken: string): Promise<SetupResult> {
  return runSqlOnProject(accessToken, getSchemaSql());
}

/**
 * Ejecuta solo el bloque de las tablas del chat (chats, chat_members,
 * chat_messages + RLS + realtime). Útil para instalar el chat sin re-ejecutar
 * todo el esquema cuando ya está montado el resto de la plataforma.
 * @param accessToken Token de acceso personal de Supabase (sbp_...).
 */
export async function runChatSchemaSetup(accessToken: string): Promise<SetupResult> {
  return runSqlOnProject(accessToken, CHAT_SCHEMA_SQL);
}

/**
 * DDL independiente de la tabla `game_plays` (ranking «más jugados 24h»).
 * Idempotente (create table if not exists + políticas reemplazadas): se puede
 * ejecutar tantas veces como sea necesario sin romper nada. Incluye el mismo
 * bloque que el esquema completo para poder instalar SOLO el ranking cuando el
 * resto de la plataforma ya está montado (esquemas instalados antes de añadir
 * esta tabla no la tienen → el ranking no sincroniza entre dispositivos).
 */
export const GAME_PLAYS_SCHEMA_SQL = `-- ───────────── RANKING: JUEGOS MÁS JUGADOS (24h) ─────────────

create table if not exists public.game_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.game_plays enable row level security;
create index if not exists game_plays_24h_idx on public.game_plays (post_id, created_at desc);

-- Lectura pública (el ranking es global) e inserción por el propio jugador.
drop policy if exists plays_read on public.game_plays;
create policy plays_read on public.game_plays for select using (true);
drop policy if exists plays_insert on public.game_plays;
create policy plays_insert on public.game_plays for insert with check (auth.uid() = user_id);
`;

/**
 * Ejecuta solo la creación de `game_plays` (ranking sincronizado). Útil cuando
 * el esquema ya está instalado pero es anterior a esta tabla.
 * @param accessToken Token de acceso personal de Supabase (sbp_...).
 */
export async function runGamePlaysSchemaSetup(accessToken: string): Promise<SetupResult> {
  return runSqlOnProject(accessToken, GAME_PLAYS_SCHEMA_SQL);
}
