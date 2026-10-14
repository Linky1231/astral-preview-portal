import { describe, expect, it } from "vitest";
import { createPortfolioExportHtml, createQrExportSvg, qrHex, safeExportFilename } from "./profile-export";

describe("exportaciones de perfil", () => {
  it("compone un QR centrado con el margen de seguridad del visor", () => {
    const svg = createQrExportSvg({ qrDataUri: "data:image/svg+xml;base64,QR", size: 180, padding: 18, frameSize: 216, background: "#ffffff" });
    expect(svg).toContain('x="95" y="95" width="530" height="530"');
    expect(svg).toContain('href="data:image/svg+xml;base64,QR"');
  });

  it("normaliza colores y nombres seguros para archivos", () => {
    expect(qrHex("#2563eb", "000000")).toBe("2563eb");
    expect(qrHex("var(--primary)", "000000")).toBe("000000");
    expect(safeExportFilename("Linky / prueba", "perfil")).toBe("linky-prueba");
  });

  it("genera un portafolio descargable sin interpolar HTML del usuario", () => {
    const html = createPortfolioExportHtml({
      displayName: "Linky", username: "linky", headline: "Creador <principal>", bio: "<script>", accentColor: "#3b82f6", skills: ["Game Design"], links: [{ label: "Sitio", url: "example.com" }], achievements: [{ title: "Lanzamiento", description: "Primer juego", date: "2026-08-23" }],
    });
    expect(html).toContain("Creador &lt;principal&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="https://example.com/"');
  });
});
