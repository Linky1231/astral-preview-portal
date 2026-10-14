/**
 * Secciones del menú de tres líneas.
 *
 * El menú ya no lista todas las opciones de la app de golpe: cada sección es
 * una única opción y al elegirla se abre su propia pantalla independiente, con
 * un botón «Volver» que regresa al menú inicial (que sigue abierto).
 *
 * Cada opción lleva su propia tarjeta: nombre, descripción real de lo que hace
 * (tomada de la pantalla que abre) y el texto de su botón de acceso. Así el
 * menú explica qué hay dentro antes de entrar, y este módulo es el único origen
 * de ese contenido: añadir una opción no obliga a tocar el marcado.
 */

export type MenuSectionId = "social" | "comunidad" | "creacion" | "ajustes";

/** Acciones que abren una pantalla o un diálogo local en vez de navegar. */
export type MenuActionId = "chats" | "notifications" | "events" | "drafts" | "storage" | "settings";

export type MenuEntry = {
  id: string;
  label: string;
  /** Qué ofrece la opción, en una línea. */
  description: string;
  /** Texto del botón que abre la opción. */
  cta: string;
  /** Ruta de la opción. Ausente cuando la opción abre un panel local. */
  to?: string;
  /** Acción local (panel o diálogo) cuando la opción no navega. */
  action?: MenuActionId;
  /** Sólo se muestra a moderadores y administradores. */
  modOnly?: boolean;
  /** Opción principal de su sección → tarjeta y botón destacados. */
  featured?: boolean;
  /** Área restringida (moderación) → tarjeta con aviso. */
  restricted?: boolean;
  /** Acento propio del producto (Centro Plus). */
  accent?: "plus";
};

export type MenuSection = {
  id: MenuSectionId;
  label: string;
  /** Resumen corto de la sección, visible antes de entrar. */
  hint: string;
  entries: MenuEntry[];
};

export const MENU_SECTIONS: MenuSection[] = [
  {
    id: "social",
    label: "Social",
    hint: "Habla con la comunidad y sigue lo que te interesa",
    entries: [
      {
        id: "chats",
        label: "Chats",
        description: "Mensajes de la comunidad, conversaciones individuales y grupos, con fotos, vídeos, archivos y avisos.",
        cta: "Abrir chats",
        action: "chats",
        featured: true,
      },
      {
        id: "search",
        label: "Buscar",
        description: "Encuentra juegos, publicaciones, personas y obras de la galería, con filtros y búsquedas recientes.",
        cta: "Buscar",
        to: "/search",
      },
      {
        id: "notifications",
        label: "Notificaciones",
        description: "Reacciones, comentarios, menciones, respuestas y nuevos seguidores reunidos por categoría.",
        cta: "Ver notificaciones",
        action: "notifications",
      },
    ],
  },
  {
    id: "comunidad",
    label: "Comunidad",
    hint: "Eventos, tu actividad, orbes e información del proyecto",
    entries: [
      {
        id: "events",
        label: "Eventos",
        description: "Concursos y actividades de la comunidad con fechas, participantes y premios.",
        cta: "Ver eventos",
        action: "events",
        featured: true,
      },
      {
        id: "history",
        label: "Historial",
        description: "Los juegos que has jugado con su tiempo y estadísticas, y las publicaciones que te han gustado.",
        cta: "Ver historial",
        to: "/history",
      },
      {
        id: "orbes",
        label: "Panel de Orbes",
        description: "Tu saldo de orbes y cada movimiento: recompensas, compras de juegos, ajustes y reembolsos.",
        cta: "Ver mis orbes",
        to: "/orbes",
      },
      {
        id: "about",
        label: "Acerca de nosotros",
        description: "Qué es Asternal, las normas de la comunidad y cómo tratamos los datos de tu cuenta.",
        cta: "Leer más",
        to: "/about",
      },
      {
        id: "moderation",
        label: "Moderación",
        description: "Usuarios y roles, correos bloqueados, puntos de confianza, eventos, foro y revisión de juegos con IA.",
        cta: "Abrir moderación",
        to: "/admin",
        modOnly: true,
        restricted: true,
      },
    ],
  },
  {
    id: "creacion",
    label: "Creación",
    hint: "Tus proyectos y los beneficios de Plus",
    entries: [
      {
        id: "drafts",
        label: "Borradores",
        description: "Los proyectos que has guardado y aún no has publicado: sigue editándolos o publícalos cuando quieras.",
        cta: "Abrir borradores",
        action: "drafts",
        featured: true,
      },
      {
        id: "storage",
        label: "Espacio extra",
        description:
          "Guarda una copia de tus juegos fuera del navegador (Firebase o tu Google Drive) para tener más espacio y no perderlos.",
        cta: "Elegir dónde guardar",
        action: "storage",
      },
      {
        id: "plus",
        label: "Centro Plus",
        description: "Efectos de nombre, marcos de perfil, insignia, orbes mensuales y tus redes sociales.",
        cta: "Ir al Centro Plus",
        to: "/plus",
        accent: "plus",
      },
    ],
  },
  {
    id: "ajustes",
    label: "Ajustes",
    hint: "Preferencias de la app en este dispositivo",
    entries: [
      {
        id: "settings",
        label: "Configuración",
        description: "Cambia el tema claro u oscuro y el idioma de la interfaz cuando quieras.",
        cta: "Abrir ajustes",
        action: "settings",
        featured: true,
      },
    ],
  },
];

export function isMenuSectionId(value: string | null | undefined): value is MenuSectionId {
  return !!value && MENU_SECTIONS.some((section) => section.id === value);
}

export function menuSectionById(id: MenuSectionId): MenuSection {
  const section = MENU_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Sección de menú desconocida: ${id}`);
  return section;
}

/** Opciones de una sección que este usuario puede ver (oculta Moderación). */
export function visibleMenuEntries(section: MenuSection, canModerate: boolean): MenuEntry[] {
  return section.entries.filter((entry) => !entry.modOnly || canModerate);
}
