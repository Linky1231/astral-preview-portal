import { describe, expect, it } from "vitest";
import { documentDisplayMeta } from "./document-display";

describe("metadatos visuales de archivo", () => {
  it("identifica el formato de los documentos para presentarlos como archivos", () => {
    expect(documentDisplayMeta("Paleta de colores y guía.pdf")).toEqual({ format: "PDF", label: "Documento PDF" });
    expect(documentDisplayMeta("escena-final.docx")).toEqual({ format: "DOCX", label: "Documento Word" });
  });

  it("mantiene un indicador neutral cuando no hay una extensión reconocible", () => {
    expect(documentDisplayMeta("referencia")).toEqual({ format: "ARCHIVO", label: "Archivo adjunto" });
    expect(documentDisplayMeta(undefined)).toEqual({ format: "ARCHIVO", label: "Archivo adjunto" });
  });
});
