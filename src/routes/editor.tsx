import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AsternalEditor } from "@/components/engine/AsternalEditor";
import { EditorChooser } from "@/components/engine/EditorChooser";
import { GDevelopV2Editor } from "@/components/engine/GDevelopV2Editor";
import { writeLastEditorMode, type EditorMode } from "@/lib/engine/last-editor-mode";

/**
 * Menú de editores.
 *
 *   /editor              → elegir entre el Editor de plataformas y Asternal V2
 *   /editor?mode=mini    → Editor de plataformas (editor nativo de Asternal)
 *   /editor?mode=v2      → editor completo de GDevelop embebido
 */
export const Route = createFileRoute("/editor")({
  validateSearch: (search: Record<string, unknown>): {
    mode: EditorMode | undefined;
    p?: string;
    beta?: boolean;
  } => ({
    mode:
      search.mode === "v2" || search.mode === "mini" ? (search.mode as EditorMode) : undefined,
    // Proyecto concreto a abrir (viene de Borradores / Crear).
    p: typeof search.p === "string" && search.p ? search.p : undefined,
    // Motor propio con las funciones nuevas en pruebas.
    beta: search.beta === true || search.beta === "1" ? true : undefined,
  }),
  head: () => ({ meta: [{ title: "Editores · Asternal" }] }),
  component: EditorRoute,
});

function EditorRoute() {
  const { mode, p, beta } = Route.useSearch();

  // Recuerda la sección abierta para ofrecer «continuar donde estabas»
  // en el menú de crear.
  useEffect(() => {
    if (mode) writeLastEditorMode(mode);
  }, [mode]);

  if (mode === "v2") return <GDevelopV2Editor />;
  if (mode === "mini") return <AsternalEditor initialProjectId={p} beta={beta} />;
  return <EditorChooser />;
}
