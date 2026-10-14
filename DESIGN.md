# DESIGN.md — Sistema de diseño de Asternal

> **Este documento es la autoridad visual de Asternal.** Antes de modificar cualquier UI
> existente o crear una pantalla nueva, lee y respeta este documento. La interfaz debe
> evolucionar como un único producto, no como páginas independientes.

---

## 1. Identidad

Asternal es una plataforma de creación de videojuegos móviles con comunidad. Su identidad
visual es **"Azul Asternal"**: un lienzo de espacio profundo, casi blanco con un matiz azul
frío, sobre el que el **degradado azul eléctrico** actúa como firma — nunca como fondo de
todo.

**Principio rector:** el degradado azul es la firma de Asternal, pero se usa con jerarquía.
Un solo degradado por pantalla donde importa: el CTA principal, la pestaña activa, el contenido
destacado. El resto de la interfaz se apoya en superficie, tipografía y espacio.

**Lo que Asternal NO es:** una plantilla SaaS genérica, Discord, Linear, ni un builder de IA.
No usamos tarjetas para todo, no ponemos sombra + borde + radio a cada elemento, y no
hacemos que todos los botones se vean iguales.

---

## 2. Paleta

Todas las superficies están pensadas **light-first** (la plataforma es clara; el modo
oscuro se ignora deliberadamente y `.dark` refleja `:root`).

### 2.1 Colores base

| Token | Valor (oklch) | Uso |
|---|---|---|
| `--canvas` | `0.972 0.006 252` | Fondo de página (body) |
| `--surface` | `1 0 0` | Tarjetas, paneles, superficies elevadas |
| `--surface-2` | `0.95 0.008 252` | Zonas insets, rellenos de estado, filas alternas |
| `--ink` | `0.165 0.028 258` | Texto principal |
| `--ink-2` | `0.43 0.028 256` | Texto secundario |
| `--ink-3` | `0.55 0.022 256` | Metadatos, fechas, horas, texto de apoyo |
| `--line` | `0.905 0.011 252` | Bordes hairline por defecto |
| `--line-strong` | `0.84 0.016 252` | Bordes destacados, inputs |

### 2.2 Azul Asternal (el degradado oficial)

| Token | Valor | Uso |
|---|---|---|
| `--blue-600` | `oklch(0.42 0.21 264)` | Extremo profundo del degradado |
| `--blue-500` (primary) | `oklch(0.52 0.19 258)` | Acción principal sólida |
| `--azure` (accent) | `oklch(0.64 0.14 240)` | Extremo claro del degradado |
| `--primary-glow` | `oklch(0.62 0.17 252)` | Iconos acentuados, enlaces |
| `--gradient-asternal` | `linear-gradient(135deg, var(--blue-600), var(--blue-500) 48%, var(--azure))` | **EL** degradado oficial |

**Reglas del degradado:**
- ✅ Permitido en: CTA principal por pantalla, pestaña activa, botón JUGAR/PUBLICAR
  principal, banner destacado, logo, marca de Plus (cyan separado).
- ✅ Permitido en versiones muy diluidas (`/10`, `/15`) para acentos de fondo.
- ❌ Prohibido en: fondos de tarjetas completas, iconos sueltos, chips de categoría,
  avatares, barras de progreso (usar color sólido), botones secundarios.

### 2.3 Colores de estado

| Token | Uso |
|---|---|
| `--success` `oklch(0.62 0.17 155)` | Like/repost positivos, saldo ganado |
| `--danger` `oklch(0.58 0.22 25)` | Destructivo, errores, saldo gastado |
| `--warn` `oklch(0.75 0.16 80)` | Avisos |
| `--info` = `--blue-500` | Información |

Los estados **nunca** usan degradado: color sólido + tinte de fondo (`bg-*-500/10`).

### 2.4 Plus (cian aparte, no compite con el azul)

`--plus: oklch(0.62 0.12 220)` + `--plus-glow` + `--gradient-plus`. Se usa **exclusivamente**
en el Centro Plus y en insignias/efectos Plus. No mezclar con el degradado Asternal en la
misma vista.

---

## 3. Tipografía

- **Sans (UI):** `SF Pro Text / Inter` → `--font-sans`. Texto de interfaz: `400/500/600`.
- **Display (títulos):** `SF Pro Display / Inter` → `--font-display`. Headings con
  `letter-spacing: -0.02em`, peso `600`. Los números de saldo/jugadas usan `tabular-nums`.
- **Mono (metadatos):** `SF Mono / JetBrains Mono` → `--font-mono`. IDs, códigos,
  marcas de tiempo, @usernames en contexto técnico.

### Escala tipográfica

| Escala | Tamaño / Interlineado | Uso |
|---|---|---|
| `display` | 28 / 32 | Números de saldo, hero |
| `title` | 20 / 26 | Títulos de pantalla/sección principal |
| `section` | 16 / 22 | Títulos de sección |
| `body` | 14 / 20 | Texto de publicaciones, cuerpo |
| `meta` | 12 / 16 | Secundario, descripciones |
| `micro` | 11 / 14 | Metadatos, timestamps, tags |

**Prohibido:** abusar de `tracking-widest` + `uppercase` en micro-textos. El micro-label
existe (`section-label`), pero se usa una vez por bloque, no en cada botón.

---

## 4. Espaciado y radio

### Espaciado (escala de 4px)

`--space-1: 4` · `--space-2: 8` · `--space-3: 12` · `--space-4: 16` · `--space-5: 20` ·
`--space-6: 24` · `--space-8: 32` · `--space-10: 40` · `--space-12: 48`

- Gutter de pantalla móvil: 16px. Desktop: 24px.
- Entre tarjetas del feed: 12px. Entre secciones: 24px.
- Padding interior estándar de superficie: 16px (12px en compacto).

### Radios

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 8px | Inputs, botones pequeños |
| `--radius-md` | 10px | Botones, chips |
| `--radius` | 12px | Superficies estándar (panel) |
| `--radius-lg` | 16px | Tarjetas destacadas, modales |
| `--radius-xl` | 20px | Banners, héroes |
| `--radius-full` | 999px | Avatares, píldoras, CTA flotante |

**Regla:** el radio crece con la importancia de la superficie. No redondear todo a
`rounded-full` ni dar `rounded-2xl` a filas de lista.

---

## 5. Bordes, sombras y elevación

### Bordes

- 1px `--line` para hairline por defecto.
- El borde es la primera herramienta de separación (no la sombra).
- Bordes de estado: tintes del color (p. ej. `border-primary/30`).

### Sombras (jerarquía de elevación)

| Nivel | Uso |
|---|---|
| `--shadow-xs` | Hover de superficies |
| `--shadow-sm` | Superficies estándar (muy sutil) |
| `--shadow-md` | Menús flotantes, drawer, modales |
| `--shadow-lg` | Overlays a pantalla completa |

**Prohibido:** sombras decorativas en chips, iconos o elementos planos. Sin glow por defecto.

---

## 6. Interacción y estados

### Estados

- **Hover:** cambio de `border-color`/`background-color` suave (150–200ms). Subir con
  `translateY` solo en superficies que invitan a tocar (tarjetas de juego).
- **Press:** `scale(0.98)` con `--ease-out-expo`, 140ms.
- **Focus:** anillo `2px var(--ring)` con `outline-offset: 2px`. Nunca eliminar el focus
  visible sin reemplazarlo.
- **Disabled:** `opacity-40` + `pointer-events-none` (no atenuar a 0).
- **Loading:** skeleton con `anim-shimmer`; spinner solo en botones en curso.

### Microinteracciones

Solo cuando dan feedback real: estado activo de pestañas, like/repost (spring corto),
apertura de menús, guardado, errores. **Prohibido:** animar entradas de tarjetas con
retrasos escalonados por índice en feeds grandes (causa layout shift y lag — usar
`card-enter` CSS puro sin delay o sin animación).

---

## 7. Componentes

### 7.1 Botones

| Variante | Uso | Apariencia |
|---|---|---|
| `primary` (sólido) | Acción principal **sólida** (Guardar, Seguir, Aplicar) | `bg-blue-500`, texto blanco |
| `gradient` | **La** CTA de la pantalla (Publicar, Jugar, Crear) | `--gradient-asternal`, texto blanco |
| `secondary` | Acción de apoyo | `--surface-2`, texto ink |
| `ghost` | Acciones en contexto (iconos de cabecera) | transparente, hover `--surface-2` |
| `danger` | Destructivo | rojo sólido |

**Reglas:**
- Máximo **un** botón gradient por pantalla.
- Botones de distinta importancia deben verse distinto (sólido vs ghost vs outline).
- Icon-button: 36–40px, `rounded-md`/`rounded-lg` (no círculos excepto el CTA flotante).

### 7.2 Superficies

- `surface` — tarjeta estándar: `--surface`, hairline, `--radius`. Sombras solo si flotan.
- `surface-2` — inset (fondos de inputs, filas seleccionadas, menús).
- **Nunca** anidar superficies con borde + sombra dentro de otra superficie si puede
  resolverse con `surface-2`.

### 7.3 Navegación

- **Tab bar principal** (`/`): segmentado con píldora medida por posición real de los
  botones (patrón ya establecido, no reintroducir `calc()`).
- **Sub-páginas:** cabecera compartida `SubPageHeader` (botón atrás + título + acciones).
  Prohibido re-implementar cabeceras por página.
- **Menu drawer:** superficie derecha con cabecera, agrupaciones `section-label`, y
  acciones separadas.

### 7.4 Publicaciones

- Distinguir tipos por estructura, no por una tarjeta idéntica:
  - Juego → ficha con portada y CTA JUGAR.
  - Arte (galería) → grid visual sin marco pesado.
  - Texto/imagen → superficie ligera con hairline superior degradado (firma).
- El menú (⋮) usa `CardMenu` (portal, sin animación, sin medición de layout).

### 7.5 Editor

- Estructuras de software, no tarjetas: toolbar, paneles, rail lateral, inspector, tree.
- Densidad alta: controles de 32px, mono para valores, sin padding de landing.
- El degradado Asternal se reserva para el botón PLAY y el estado activo del rail.

---

## 8. Iconografía

- `lucide-react` (peso 1.75–2 por defecto).
- Iconos como apoyo semántico, nunca como decoración suelta sin etiqueta.
- Tamaños: 14–16px en UI densa, 18–20px en CTA, 24px máximo en estados vacíos.
- `text-muted-foreground` por defecto; `text-primary-glow` solo en iconos con significado.

---

## 9. Accesibilidad

- Contraste mínimo AA: texto body sobre `--surface` ≥ 4.5:1 (los `ink-2/3` están
  calibrados para ello; no usar `text-muted-foreground` en textos esenciales).
- Los degradados no se usan como único canal de información (siempre hay icono/texto).
- Targets táctiles ≥ 36px en móvil; botones de acción principal ≥ 40px.
- Focus visible en toda interacción; `prefers-reduced-motion` desactiva animaciones.
- Los textos en gradiente sobre fondo claro usan `bg-clip-text` con `ink` de respaldo
  para que no se pierdan si falla el gradiente.

---

## 10. Responsive

- Móvil (<640): layout de una columna, tab bar con iconos+etiquetas cortas, CTA flotante.
- Tablet (640–1024): dos columnas donde aporta (galería, ranking), cabeceras compactas.
- Desktop (>1024): contenedor `max-w-6xl`, grids más amplios, editor con rail lateral.
- El editor prioriza en móvil: viewport + tool strip + panel contextual único.

---

## 11. Anti-patrones prohibidos

- ❌ Tarjeta para absolutamente todo (filas de lista, estadísticas, headers).
- ❌ `panel` + borde + sombra + radio en el mismo elemento sin necesidad.
- ❌ Degradado azul en más de un elemento dominante por pantalla.
- ❌ Botones visualmente idénticos para acciones de distinta importancia.
- ❌ `tracking-widest uppercase` en micro-textos repetidos.
- ❌ Sombras decorativas y glow en elementos planos.
- ❌ Grids repetitivos de tarjetas idénticas cuando una lista/tabla/rail funciona mejor.
- ❌ Glassmorphism sin propósito (backdrop-blur en todo).
- ❌ Animaciones de entrada escalonadas en listas largas.
- ❌ Variar tokens por pantalla: una sola fuente de verdad (`styles.css` + este documento).
- ❌ `Math.random()` en orden/animaciones (causa layout shift y lag).
- ❌ Reimplementar cabeceras, pestañas o menús por página: usar los componentes compartidos.

---

## 12. Checklist antes de dar por terminada una pantalla

1. ¿Podría confundirse con una interfaz genérica de un AI builder? → rediseñar.
2. ¿Usa tarjetas porque son necesarias o por defecto?
3. ¿La jerarquía visual es clara a 2 metros?
4. ¿El degradado azul tiene una función y aparece una sola vez dominante?
5. ¿La pantalla parece Asternal (lienzo frío + firma azul)?
6. ¿Sigue este documento (tokens, componentes, radios, elevación)?
7. ¿Los estados importantes son visibles (activo, hover, focus, disabled, error)?
8. ¿Hay decoración que no aporta? → quitar.
9. ¿La densidad es apropiada para la función?
10. ¿La experiencia es mejor que antes, no solo diferente?
