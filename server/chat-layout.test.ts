import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync(new URL("../src/components/social/ChatSection.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/social/chat.ts", import.meta.url), "utf8");
const threads = readFileSync(new URL("../src/components/social/WorkChatPanel.tsx", import.meta.url), "utf8").split("export function ThreadView")[1];

describe("conversaciones y adjuntos", () => {
  it("monta el chat fuera de contenedores limitados y ocupa toda la pantalla", () => {
    expect(chat).toContain("return createPortal(");
    expect(chat).toContain('className="fixed inset-x-0 top-0 z-[90] h-dvh w-full min-w-0 bg-background flex flex-col overflow-hidden"');
    expect(chat).not.toContain("h-[calc(100dvh-1.5rem)]");
    expect(chat).toContain("document.body,");
  });
  it("reúne fotos, vídeos y archivos en un único selector sin filtro de tipo", () => {
    expect(chat).toContain('aria-label="Adjuntar fotos, vídeos o archivos"');
    expect(chat).toMatch(/ref=\{attachmentInputRef\}\s+type="file"\s+className="hidden"/);
    expect(chat).not.toContain("photoInputRef");
    expect(chat).not.toContain("videoInputRef");
    expect(chat).toContain('m.media_type === "file"');
    expect(api).toContain('else if (opts.mediaType === "file") payload.media_type = "file"');
    expect(chat).not.toContain("mediaUrl: pendingMedia.file.name");
  });
  it("muestra los mensajes de los hilos a pantalla completa", () => {
    expect(threads).toContain('aria-label="Conversación del hilo a pantalla completa"');
    expect(threads.split("export function")[0]).not.toContain("max-w-sm");
  });
});
