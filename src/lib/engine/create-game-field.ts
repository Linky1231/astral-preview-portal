/**
 * Estilo de los campos de texto del diálogo «Crear» (nombre del juego, título,
 * descripción y enlace).
 *
 * En móvil el tamaño de letra es de 16px (text-base): iOS Safari hace zoom
 * automático sobre la pantalla al enfocar un campo por debajo de 16px, así que
 * al tocar el nombre del juego la vista se acercaba. A partir de `md` el campo
 * vuelve a 14px para conservar el tamaño de escritorio, igual que los campos
 * compartidos (src/components/ui/input.tsx).
 */
export const CREATE_GAME_FIELD_CLASS =
  "w-full mt-1 bg-input/50 rounded-lg px-3 py-2 text-base md:text-sm outline-none focus:ring-2 focus:ring-primary/40";
