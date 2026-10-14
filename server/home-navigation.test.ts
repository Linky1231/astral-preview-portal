import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "../src/routeTree.gen";
import { GamesHome } from "../src/components/social/GamesHome";
import type { PostWithMeta } from "../src/lib/social/api";

/**
 * Contrato de Inicio: buscador que lleva a Buscar, cuatro sub-secciones
 * (inicio/ranking/nuevos/explorar), cuatro publicaciones del feed con acceso
 * directo a Publicaciones, y la navegación inferior renombrada
 * (Inicio · Publicaciones · Crear · Tienda · Perfil).
 */

// El árbol real arranca mostrando el esqueleto de carga (loadingTab = "games").
// Para poder observar el contenido de Inicio en SSR se neutraliza el indicador.
vi.mock("@/lib/social/tab-switch", () => ({
  isTabLoading: () => false,
  shouldFetchPrimaryTab: () => false,
}));

function installWindowStub() {
  const store = new Map<string, string>();
  const noop = () => {};
  const events = { addEventListener: noop, removeEventListener: noop };
  // La portada decide su primera pantalla leyendo el almacenamiento: con
  // sesión guardada pinta el panel de Inicio (lo que verifica este test) y sin
  // ella pinta la pantalla de acceso. Aquí se simula un dispositivo con
  // sesión iniciada.
  store.set("sb-gxpgczwkovertezeydkt-auth-token", JSON.stringify({ access_token: "test" }));
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { window: unknown }).window = {
    ...events,
    matchMedia: () => ({ matches: false, ...events, addListener: noop, removeListener: noop }),
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    scrollTo: noop,
    requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    self: globalThis,
  };
}

function fakeGames(count: number): PostWithMeta[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `g${i}`,
    content: `🎮 Juego ${i}`,
    created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
    likes: 20 - i,
    favorites: 5,
    comments_count: 1,
    author_id: "u1",
    author: { username: "atlas" },
    signed_cover: null,
    signed_screenshots: [],
    asset_preset: null,
    owned: i % 2 === 0,
    game_genre: "Plataformas",
  })) as unknown as PostWithMeta[];
}

describe("Inicio", () => {
  beforeEach(() => installWindowStub());
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("renderiza buscador, sub-secciones, publicaciones en Inicio y la nav renombrada", async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    const html = renderToString(createElement(RouterProvider, { router }) as never);

    // Marca del encabezado: el icono aporta la «A» y el nombre sigue con
    // «sternal», así que dice «Asternal» sin repetir la letra.
    expect(html).toContain('aria-label="Asternal"');
    expect(html).toContain(">sternal<");
    expect(html).not.toContain(">Asternal<");
    // Buscador de Inicio (botón que navega a /search)
    expect(html).toContain('aria-label="Ir a la sección Buscar"');
    expect(html).toContain("Buscar juegos, publicaciones, personas…");
    // Sub-secciones de Inicio
    for (const label of ["INICIO", "RANKING", "NUEVOS", "EXPLORAR"]) {
      expect(html).toContain(`<!-- -->${label}</button>`);
    }
    // Publicaciones dentro de Inicio, con un ÚNICO acceso a la pestaña
    expect(html).toContain("Lo último de la comunidad");
    expect(html).toContain("Aún no hay publicaciones");
    expect(html).toContain("VER TODAS");
    expect(html).not.toContain("IR A PUBLICACIONES");
    // Navegación inferior renombrada
    expect(html).toContain(">Inicio</span>");
    expect(html).toContain(">Publicaciones</span>");
    expect(html).toContain(">Tienda</span>");
    expect(html).toContain("lucide-store");
    expect(html).not.toContain(">Juegos</span>");
    expect(html).not.toContain(">Feed</span>");
    expect(html).not.toContain(">Galería</span>");
  });

  it("las sub-secciones de Inicio renderizan ranking, nuevos y explorar", () => {
    const props = { games: fakeGames(12), myId: "u1", isMod: false, onChange: () => {} };

    const nuevos = renderToString(createElement(GamesHome, { ...props, view: "nuevos" }));
    expect(nuevos).toContain("Nuevos");
    expect(nuevos).toContain("Lo último que ha publicado la comunidad");

    const explorar = renderToString(createElement(GamesHome, { ...props, view: "explorar" }));
    expect(explorar).toContain("Explorar");
    expect(explorar).toContain("Todo el catálogo de juegos de Asternal");

    const ranking = renderToString(createElement(GamesHome, { ...props, view: "ranking" }));
    expect(ranking).toContain("Ranking · Más jugados (24h)");
    expect(ranking).toMatch(/TOP (<!-- -->)?10/);

    const inicio = renderToString(createElement(GamesHome, { ...props, view: "inicio" }));
    expect(inicio).toContain("JUGAR");
    // «Nuevos» no se repite como chip de Tendencias (ya es una sub-sección).
    expect(inicio).not.toContain("Nuevos");
  });
});
