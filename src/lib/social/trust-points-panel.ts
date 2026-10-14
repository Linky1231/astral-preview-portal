export type TrustLevelPresentation = {
  label: "crítico" | "bajo" | "normal";
  textClass: string;
  surfaceClass: string;
  progressColor: string;
};

/**
 * Mantiene los niveles semánticos sin introducir colores ajenos a Azure Drift.
 * La intensidad de azul comunica el nivel; el texto y los bordes conservan
 * contraste coherente con la superficie glass de Asternal.
 */
export function trustLevelPresentation(points: number): TrustLevelPresentation {
  if (points <= 2) {
    return {
      label: "crítico",
      textClass: "text-primary",
      surfaceClass: "bg-primary/15 border-primary/35",
      progressColor: "var(--blue-600)",
    };
  }

  if (points <= 6) {
    return {
      label: "bajo",
      textClass: "text-primary",
      surfaceClass: "bg-primary/12 border-primary/30",
      progressColor: "var(--primary)",
    };
  }

  return {
    label: "normal",
    textClass: "text-primary",
    surfaceClass: "bg-primary/8 border-primary/25",
    progressColor: "var(--azure)",
  };
}
