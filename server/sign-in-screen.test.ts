import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// La pantalla usa el `Link` del enrutador para «¿Olvidaste tu contraseña?».
// Se sustituye por un ancla: lo que se mide aquí es el diseño y el flujo de
// acceso, no la navegación (que tiene sus propias pruebas en el proyecto).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    createElement("a", { href: to }, children),
}));

const { SignInSide } = await import("../src/components/auth/SignInSide");

/**
 * La pantalla de acceso no se presenta con una lista de funciones, ni con un
 * simulacro del editor, ni con la escena animada del mundo vivo: la marca son el
 * logotipo y una línea, y el conmutador Entrar/Crear cuenta vive dentro de la
 * tarjeta en lugar de un enlace suelto al pie.
 */
describe("pantalla de acceso", () => {
  const html = renderToStaticMarkup(createElement(SignInSide, {}));

  it("abre con el logotipo integrado y una sola «A»", () => {
    // Una sola «A»: la del logo, y el nombre sigue con «sternal».
    expect(html).toContain('aria-label="Asternal"');
    expect(html).toContain(">sternal<");
    expect(html).not.toContain(">Asternal<");
  });

  it("presenta la marca sin la escena animada del mundo vivo", () => {
    // La pantalla no lleva el lienzo del mundo: ni el canvas ni la escena ni su
    // titular. La marca es el logotipo y una línea, y la tarjeta manda.
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("Un mundo vivo, hecho con código.");
    expect(html).toContain("Descubre y juega creaciones hechas con Asternal");
    // Ni cromo falso del editor ni píldoras de características.
    expect(html).not.toContain("escena_01");
    expect(html).not.toContain("VISTA PREVIA");
    expect(html).not.toContain("60 fps");
    expect(html).not.toContain("Editor por bloques");
    expect(html).not.toContain("Todo juego comienza");
  });

  it("tiene un solo encabezado, el de la tarjeta de acceso", () => {
    // Sin el titular del panel de marca, el título de la tarjeta pasa a ser el
    // `<h1>` de la pantalla: un único encabezado, y es el que la identifica.
    expect(html.match(/<h1/g)).toHaveLength(1);
    // Y el encabezado es justo el título de la tarjeta, sin adornos.
    expect(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]).toBe("Iniciar sesión");
  });

  it("lleva el conmutador de modo dentro de la tarjeta, sin enlace al pie", () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain("ENTRAR");
    expect(html).toContain("CREAR CUENTA");
    expect(html).not.toContain("Regístrate");
  });

  it("mantiene el flujo de acceso completo", () => {
    expect(html).toContain("Usuario o correo");
    expect(html).toContain("Contraseña");
    expect(html).toContain("Recordarme aquí");
    expect(html).toContain("¿Olvidaste tu contraseña?");
    expect(html).toContain("Iniciar sesión");
  });

  it("no dibuja ojos dentro de los recuadros de escritura", () => {
    // Los campos son recuadros con icono y texto: sin ojos animados dentro.
    expect(html).not.toContain("data-type-eyes");
    expect(html).not.toContain("viewBox=\"0 0 24 14\"");
  });

  it("vuelve al icono de ojo para mostrar y ocultar la contraseña", () => {
    // El botón del final del recuadro es el de siempre, accesible por teclado
    // y con su estado en `aria-pressed`.
    expect(html).toContain('aria-label="Mostrar contraseña"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("lucide-eye");
    // Sin `tabIndex={-1}`: el control se alcanza con el teclado.
    expect(html).not.toMatch(/aria-label="Mostrar contraseña"[^>]*tabindex="-1"/);
  });
});
