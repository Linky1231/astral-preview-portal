import { supabase } from "@/integrations/supabase/client";
import { isAdmin } from "@/lib/social/api";
import {
  DEFAULT_COMMUNITY_SETTINGS,
  normalizeCommunitySettings,
  parseCommunitySettings,
  serializeCommunitySettings,
  type CommunitySettings,
  type StoredCommunitySettings,
} from "./about";

const SETTINGS_CATEGORY = "system";
const SETTINGS_TYPE = "about_settings";

type SettingsRow = { id: string; content: string | null; updated_at: string | null };

/** Lee el único documento comunitario sin crear tablas ni mezclarlo con el feed público. */
export async function fetchCommunitySettings(): Promise<StoredCommunitySettings> {
  const { data, error } = await supabase
    .from("posts")
    .select("id,content,updated_at")
    .eq("category", SETTINGS_CATEGORY)
    .eq("post_type", SETTINGS_TYPE)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_COMMUNITY_SETTINGS };
  const row = data as SettingsRow;
  return { ...parseCommunitySettings(row.content), id: row.id, updatedAt: row.updated_at };
}

/** Solo una cuenta con rol de administración puede actualizar las reglas globales. */
export async function saveCommunitySettings(input: CommunitySettings): Promise<StoredCommunitySettings> {
  if (!(await isAdmin())) throw new Error("Solo la administración puede actualizar Acerca de nosotros.");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Inicia sesión para guardar los ajustes de la comunidad.");

  const settings = normalizeCommunitySettings(input);
  const content = serializeCommunitySettings(settings);
  const current = await fetchCommunitySettings();
  const payload = {
    content,
    category: SETTINGS_CATEGORY,
    post_type: SETTINGS_TYPE,
  };

  if (current.id) {
    const { error } = await supabase.from("posts").update(payload).eq("id", current.id);
    if (error) throw error;
    return { ...settings, id: current.id, updatedAt: new Date().toISOString() };
  }

  const { data, error } = await supabase.from("posts").insert({
    ...payload,
    author_id: auth.user.id,
    media_urls: [],
    media_type: "none",
  } as never).select("id,updated_at").single();
  if (error) throw error;
  const row = data as { id: string; updated_at: string | null };
  return { ...settings, id: row.id, updatedAt: row.updated_at };
}
