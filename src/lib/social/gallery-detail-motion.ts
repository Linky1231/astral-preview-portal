const DETAIL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function galleryDetailMotion(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      overlay: { duration: 0 },
      panel: { duration: 0 },
      initialPanel: false,
    };
  }

  return {
    overlay: { duration: 0.16 },
    panel: { duration: 0.24, ease: DETAIL_EASE },
    initialPanel: { opacity: 0, y: 16, scale: 0.985 },
  };
}
