/**
 * SmartStatus — Análisis personalizado de estado de cuenta.
 *
 * No usa IA. Analiza datos del usuario con reglas para generar
 * estados interpretativos personalizados en lugar de mensajes estáticos.
 */

export type SmartStatus = {
  severity: "normal" | "attention" | "warning" | "urgent";
  title: string;
  message: string;
  area: string;
};

type AnalysisData = {
  trustPoints: number;
  followers: number;
  following: number;
  gamesCount: number;
  postsCount: number;
  notificationsUnread: number;
  orbes: number;
  lastLoginDays: number; // días desde último login
  accountAgeDays: number;
  isMod: boolean;
  isAdmin: boolean;
};

/**
 * Analiza los datos del usuario y genera un estado personalizado.
 * Cada usuario recibe un estado diferente según sus patrones reales.
 */
export function generateSmartStatus(data: AnalysisData): SmartStatus {
  const signals: Array<{ score: number; status: SmartStatus }> = [];

  // ── SEÑAL: Confianza ──
  if (data.trustPoints <= 2) {
    signals.push({
      score: 90,
      status: {
        severity: "urgent",
        title: "Confianza crítica",
        message: `Solo tienes ${data.trustPoints} punto(s) de confianza. Si llegas a 0, tu cuenta será bloqueada automáticamente. Revisa la actividad reciente de tu cuenta.`,
        area: "cuenta",
      },
    });
  } else if (data.trustPoints <= 5) {
    signals.push({
      score: 70,
      status: {
        severity: "warning",
        title: "Confianza reducida",
        message: `Tienes ${data.trustPoints} puntos de confianza, por debajo del nivel habitual. Esto puede limitar algunas funciones de tu cuenta.`,
        area: "cuenta",
      },
    });
  }

  // ── SEÑAL: Notificaciones acumuladas ──
  if (data.notificationsUnread >= 50) {
    signals.push({
      score: 60,
      status: {
        severity: "attention",
        title: "Tus notificaciones necesitan atención",
        message: `Tienes ${data.notificationsUnread} notificaciones sin revisar. La actividad acumulada puede contener cambios importantes en tus proyectos.`,
        area: "comunidad",
      },
    });
  } else if (data.notificationsUnread >= 20) {
    signals.push({
      score: 40,
      status: {
        severity: "normal",
        title: "Actividad reciente detectada",
        message: `${data.notificationsUnread} notificaciones pendientes. Hay movimiento en tu cuenta que podrías querer revisar.`,
        area: "comunidad",
      },
    });
  }

  // ── SEÑAL: Cuenta nueva sin actividad ──
  if (data.accountAgeDays < 7 && data.gamesCount === 0 && data.postsCount === 0) {
    signals.push({
      score: 50,
      status: {
        severity: "normal",
        title: "Bienvenido a Asternal",
        message: `Tu cuenta tiene ${data.accountAgeDays} día(s). Para empezar, crea tu primer juego o publica algo en el feed. La comunidad está esperándote.`,
        area: "cuenta",
      },
    });
  }

  // ── SEÑAL: Cuenta inactiva ──
  if (data.lastLoginDays >= 14 && data.gamesCount > 0) {
    signals.push({
      score: 55,
      status: {
        severity: "attention",
        title: "Tu proyecto te espera",
        message: `Llevas ${data.lastLoginDays} días sin actividad. Tus ${data.gamesCount} juego(s) pueden tener actualizaciones pendientes de la comunidad.`,
        area: "desarrollo",
      },
    });
  } else if (data.lastLoginDays >= 30) {
    signals.push({
      score: 65,
      status: {
        severity: "warning",
        title: "Cuenta inactiva",
        message: `Han pasado ${data.lastLoginDays} días desde tu última visita. Si tenías proyectos activos, la comunidad puede haberse movido sin ti.`,
        area: "cuenta",
      },
    });
  }

  // ── SEÑAL: Desarrollador activo ──
  if (data.gamesCount >= 3 && data.lastLoginDays <= 1) {
    signals.push({
      score: 20,
      status: {
        severity: "normal",
        title: "En racha de desarrollo",
        message: `Tienes ${data.gamesCount} proyectos activos y estás muy conectado. Sigue así — tu actividad mantiene viva a la comunidad.`,
        area: "desarrollo",
      },
    });
  }

  // ── SEÑAL: Baja actividad social ──
  if (data.followers === 0 && data.following === 0 && data.accountAgeDays > 7) {
    signals.push({
      score: 35,
      status: {
        severity: "normal",
        title: "Amplía tu red",
        message: `Aún no tienes conexiones en la plataforma. Seguir a otros creadores te mantendrá al tanto de las tendencias y te ayudará a crecer.`,
        area: "comunidad",
      },
    });
  }

  // ── SEÑAL: Alta actividad social ──
  if (data.followers >= 20 && data.following >= 10) {
    signals.push({
      score: 15,
      status: {
        severity: "normal",
        title: "Centro de la comunidad",
        message: `${data.followers} personas te siguen y sigues a ${data.following}. Eres una parte activa del ecosistema Asternal.`,
        area: "comunidad",
      },
    });
  }

  // ── SEÑAL: Moderador activo ──
  if ((data.isMod || data.isAdmin) && data.notificationsUnread >= 10) {
    signals.push({
      score: 60,
      status: {
        severity: "attention",
        title: "Hay asuntos pendientes",
        message: `Como ${data.isAdmin ? "administrador" : "moderador"}, tienes ${data.notificationsUnread} notificaciones que pueden requerir tu revisión.`,
        area: "sistema",
      },
    });
  }

  // ── SEÑAL: Orbes altos ──
  if (data.orbes >= 1000) {
    signals.push({
      score: 10,
      status: {
        severity: "normal",
        title: "Recurso acumulado",
        message: `Tienes ${data.orbes.toLocaleString()} orbes. Sigue participando en la comunidad para hacer crecer tus recursos.`,
        area: "cuenta",
      },
    });
  }

  // ── DEFAULT: Todo normal ──
  if (signals.length === 0) {
    return {
      severity: "normal",
      title: "Todo funciona correctamente",
      message: "Tu cuenta está en buen estado. No se detectaron situaciones que requieran tu atención.",
      area: "sistema",
    };
  }

  // Retornar la señal con mayor prioridad (score más alto)
  signals.sort((a, b) => b.score - a.score);
  return signals[0].status;
}
