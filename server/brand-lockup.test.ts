import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AsternalLetterA, AsternalLogo, AsternalMark } from "../src/components/brand/AsternalLogo";

/**
 * Identidad del logotipo: la «A» del logo es la primera letra del nombre y a
 * continuación sigue «sternal», de modo que el título se lee como una sola
 * palabra, «Asternal», sin que la letra aparezca dos veces ni dentro de un
 * cuadro aparte.
 */
describe("logotipo de Asternal", () => {
  it("no repite la A: la letra del logo abre la palabra y el nombre sigue con «sternal»", () => {
    const html = renderToStaticMarkup(createElement(AsternalLogo, { size: 46 }));

    expect(html).toContain(">sternal<");
    expect(html).not.toContain(">Asternal<");
    // El nombre para lectores de pantalla sigue siendo «Asternal»: lo anuncia el
    // propio logotipo y el texto visible se oculta para no duplicarlo.
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Asternal"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("integra la letra del logo en el texto: mismo tipo, línea base y alto de mayúscula", () => {
    const html = renderToStaticMarkup(createElement(AsternalLogo, { size: 46 }));

    expect(html).toContain("items-baseline");
    // 46 / 0.82 ≈ 56 px de texto; la «A» mide 0,71 em de ese texto (≈ 40 px).
    expect(html).toContain("font-size:56px");
    expect(html).toContain('viewBox="0 0 29 39"');
    expect(html).toContain('height="40"');
    // La letra va suelta: el cuadro del icono no aparece en el logotipo.
    expect(html).not.toContain('viewBox="0 0 64 64"');
  });

  it("la letra suelta se puede usar sola, con el mismo trazo que el icono", () => {
    const html = renderToStaticMarkup(createElement(AsternalLetterA, { height: 39 }));

    expect(html).toContain('viewBox="0 0 29 39"');
    expect(html).toContain('height="39"');
    // Decorativa: la nombra el logotipo que la contiene.
    expect(html).toContain('aria-hidden="true"');
  });

  it("el acabado del título es el de la marca: degradado en el nombre y volumen en la letra", () => {
    const html = renderToStaticMarkup(createElement(AsternalLogo, { size: 46 }));

    // El nombre lleva el degradado recortado a las letras y con exactamente los
    // mismos dos azules de marca que la «A» (de la altura de mayúscula a la
    // línea base: del 15 % al 85 % de su caja).
    expect(html).toContain(
      "linear-gradient(to bottom, var(--primary) 15%, color-mix(in oklab, var(--primary-glow) 35%, var(--primary)) 85%)",
    );
    expect(html).toContain("background-clip:text");
    // El azul del texto ya no entra en el logotipo: la palabra va en azul de
    // marca, no en el color del tema.
    expect(html).not.toContain("var(--foreground)");
    // Ese azul claro se escribe una sola vez y se usa en las tres piezas del
    // logotipo: el degradado de la «A», su halo y el relleno del nombre.
    expect(html.match(/color-mix\(in oklab, var\(--primary-glow\) 35%, var\(--primary\)\)/g)).toHaveLength(3);
    // La «A» lleva su halo azul por detrás (el filtro va en unidades del glifo).
    expect(html).toContain("feGaussianBlur");
    expect(html).toContain("stdDeviation=\"1.6\"");
  });

  it("sin nombre, el logotipo es el icono de la aplicación", () => {
    const html = renderToStaticMarkup(createElement(AsternalLogo, { size: 46, showWordmark: false }));

    expect(html).toContain('viewBox="0 0 64 64"');
    expect(html).toContain('aria-label="Asternal"');
    expect(html).toContain('width="46"');
    // El nombre accesible lo aporta el icono; no hay texto visible que repetir.
    expect(html).not.toContain(">sternal<");
  });

  it("el icono suelto mantiene su nombre accesible y su tamaño", () => {
    const html = renderToStaticMarkup(createElement(AsternalMark, { size: 32 }));

    expect(html).toContain('aria-label="Asternal"');
    expect(html).toContain('width="32"');
  });
});
