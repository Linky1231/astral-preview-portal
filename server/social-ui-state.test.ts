import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "../src/lib/auth/friendly-error";
import { nextExclusiveFooterAction, optimisticFollowStats, postFooterActionIsActive, profileControlStateClass, socialActionStateClass } from "../src/lib/social/interaction-state";
import { galleryPreviewAuthor, galleryPreviewPrice, isArtistGalleryArtwork } from "../src/lib/social/gallery-preview";
import { galleryDetailMotion } from "../src/lib/social/gallery-detail-motion";
import { qrPreviewGeometry } from "../src/lib/social/qr-preview";
import { postSurfaceClass } from "../src/lib/social/post-surface";
import { searchResultRowClass, searchResultTextClass } from "../src/lib/social/search-presentation";
import { notificationCategoryOf, notificationEventRowClass, notificationFilterControlClass, notificationTotals } from "../src/lib/social/notification-presentation";

describe("mensajes de acceso", () => {
  it("traduce el fallo técnico de credenciales a una explicación clara", () => {
    expect(friendlyAuthError("Load Failed")).toBe("Usuario o contraseña incorrectos. Revísalos e inténtalo de nuevo.");
  });
});

describe("estado visual de acciones sociales", () => {
  it("usa el azul de marca para una acción seleccionada sin convertirla en botón", () => {
    const state = socialActionStateClass(true);
    expect(state).toContain("bg-transparent");
    expect(state).toContain("text-primary");
    expect(state).not.toContain("shadow");
    expect(state).not.toContain("bg-primary/");
  });

  it("mantiene una acción inactiva sin fondo seleccionado", () => {
    const state = socialActionStateClass(false);
    expect(state).toContain("bg-transparent");
    expect(state).toContain("text-muted-foreground");
  });

  it("mantiene los controles de Perfil neutros hasta que su panel esté abierto", () => {
    const neutral = profileControlStateClass(false);
    expect(neutral).toContain("bg-surface");
    expect(neutral).not.toContain("bg-primary");

    const active = profileControlStateClass(true);
    expect(active).toContain("bg-primary");
    expect(active).toContain("text-primary-foreground");
  });

  it("mantiene un único foco visual entre las acciones inferiores de una publicación", () => {
    expect(nextExclusiveFooterAction(null, "like")).toBe("like");
    expect(nextExclusiveFooterAction("like", "favorite")).toBe("favorite");
    expect(nextExclusiveFooterAction("repost", "repost")).toBeNull();
  });

  it("reserva el azul del pie para las acciones propias y no para un foco temporal", () => {
    const ownActions = { liked: true, favorited: false, reposted: true, commentsOpen: false };
    expect(postFooterActionIsActive("like", ownActions)).toBe(true);
    expect(postFooterActionIsActive("favorite", ownActions)).toBe(false);
    expect(postFooterActionIsActive("repost", ownActions)).toBe(true);
    expect(postFooterActionIsActive("comments", ownActions)).toBe(false);
    expect(postFooterActionIsActive("comments", { ...ownActions, commentsOpen: true })).toBe(true);
  });

  it("actualiza el seguimiento y su contador de forma optimista sin valores negativos", () => {
    const following = optimisticFollowStats({ followers: 4, i_follow: false }, true);
    expect(following).toEqual({ followers: 5, i_follow: true });
    expect(optimisticFollowStats({ followers: 0, i_follow: true }, false)).toEqual({ followers: 0, i_follow: false });
  });

  it("reserva un margen de seguridad con el marco QR redondeado predeterminado", () => {
    expect(qrPreviewGeometry(240, "rounded")).toEqual({ padding: 16, frameSize: 272 });
  });
});

describe("vista previa de obras", () => {
  it("muestra un autor claro sin añadir metadatos secundarios a la tarjeta", () => {
    expect(galleryPreviewAuthor("criper")).toBe("@criper");
    expect(galleryPreviewAuthor(" ")).toBe("Artista");
  });

  it("muestra el precio como un número compacto y no negativo", () => {
    expect(galleryPreviewPrice(8195)).toBe("8195");
    expect(galleryPreviewPrice(-10)).toBe("0");
  });

  it("limita la Galería a obras artísticas y excluye assets heredados de la antigua Tienda", () => {
    expect(isArtistGalleryArtwork({ category: "artwork", asset_preset: null })).toBe(true);
    expect(isArtistGalleryArtwork({ category: "artwork", asset_preset: { kind: "sprite" } })).toBe(false);
    expect(isArtistGalleryArtwork({ category: "game_asset", asset_preset: null })).toBe(false);
    expect(isArtistGalleryArtwork(undefined)).toBe(false);
  });
});

describe("capas Azure Drift de publicaciones", () => {
  it("usa una ficha neutra y legible para el juego fijado, no una superficie de botón", () => {
    const game = postSurfaceClass("game");
    expect(game).toContain("bg-card");
    expect(game).toContain("border-border");
    expect(game).not.toContain("bg-black");
    expect(game).not.toContain("bg-primary/");
    expect(game).not.toContain("grad-brand");
  });

  it("mantiene las piezas informativas en capas azules y no las convierte en acciones principales", () => {
    for (const kind of ["poll", "html", "locked"] as const) {
      const surface = postSurfaceClass(kind);
      expect(surface).toContain("bg-primary");
      expect(surface).not.toContain("grad-brand");
    }
  });
});

describe("resultados del buscador", () => {
  it("usa una fila informativa neutra, no un botón ni una superficie con degradado", () => {
    expect(searchResultRowClass).toContain("search-result-row");
    expect(searchResultRowClass).toContain("border");
    expect(searchResultRowClass).not.toContain("bg-card");
    expect(searchResultRowClass).not.toContain("grad-brand");
    expect(searchResultRowClass).not.toContain("bg-primary");
  });

  it("mantiene títulos, extractos y metadatos con contraste legible", () => {
    expect(searchResultTextClass("title")).toBe("text-foreground");
    expect(searchResultTextClass("excerpt")).toBe("text-foreground/70");
    expect(searchResultTextClass("meta")).toBe("text-muted-foreground/70");
  });
});

describe("notificaciones reales y legibles", () => {
  it("deriva los conteos exclusivamente de eventos recibidos", () => {
    const totals = notificationTotals([
      { type: "follow", read: false, created_at: "2026-08-24T10:00:00Z" },
      { type: "comment", read: true, created_at: "2026-08-24T10:01:00Z" },
      { type: "game", read: false, created_at: "2026-08-24T10:02:00Z" },
    ]);
    expect(totals).toEqual({
      total: 3,
      unread: 2,
      categories: {
        interacciones: { total: 1, unread: 0 },
        seguidores: { total: 1, unread: 1 },
        juegos: { total: 1, unread: 1 },
      },
    });
    expect(notificationCategoryOf("unknown")).toBe("interacciones");
  });

  it("mantiene filtros y eventos como capas informativas, sin degradado de botón", () => {
    expect(notificationFilterControlClass).toContain("notification-filter-control");
    expect(notificationFilterControlClass).not.toContain("bg-primary");
    expect(notificationFilterControlClass).not.toContain("grad-brand");
    expect(notificationEventRowClass).toContain("notification-event-row");
    expect(notificationEventRowClass).not.toContain("bg-primary");
  });
});

describe("apertura del detalle de obras", () => {
  it("usa una transición breve y desactiva el movimiento si el usuario lo solicita", () => {
    expect(galleryDetailMotion(false).panel.duration).toBe(0.24);
    expect(galleryDetailMotion(true)).toEqual({
      overlay: { duration: 0 },
      panel: { duration: 0 },
      initialPanel: false,
    });
  });
});
