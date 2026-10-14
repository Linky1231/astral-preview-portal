import { useId, type CSSProperties } from "react";

/**
 * Marca de Asternal, hecha con código.
 *
 * Son dos piezas vectoriales —nítidas a cualquier tamaño y sin depender de
 * archivos de imagen— construidas alrededor de la letra «A»:
 *
 *   · `AsternalMark`: el icono de la aplicación (el cuadro con degradado de
 *     marca, la «A» y el destello). Es el que usan el favicon/manifiesto.
 *   · `AsternalLogo`: el logotipo, que es el nombre escrito «Asternal». La «A»
 *     es la misma letra del icono (su mismo trazo, aquí sin cuadro, con
 *     degradado y un halo suave) y a continuación sigue «sternal» con la misma
 *     tipografía, tamaño, línea base y, sobre todo, los mismos azules: la letra
 *     y la palabra comparten un único degradado de marca.
 *
 * Así el título no repite la letra: hay una sola «A», la del logo, integrada
 * en la palabra. Los dos azules salen de los tokens del tema, de modo que el
 * logotipo se ve como una sola pieza en claro y en oscuro.
 */

/**
 * Trazo de la «A»: chevron de dos trazos con vértice en punta, barra
 * atravesada y contraforma triangular (el hueco entre los trazos, por encima de
 * la barra) recortada con `evenodd`. Se define como un único contorno para que
 * el borde sea continuo y no queden costuras donde la barra cruza los trazos.
 */
const A_OUTLINE =
  "M17.5 51.5 L32 12.5 L46.5 51.5 L38.6 51.5 L36.4 42.8 L27.6 42.8 L25.4 51.5 Z " +
  "M28.7 38.5 L35.3 38.5 L32 25.8 Z";

/**
 * El mismo trazo, trasladado al origen para que el logotipo lo use suelto: el
 * vértice queda en `y = 0` y la línea base en `y = 39`, de modo que el glifo se
 * puede apoyar exactamente sobre la línea base del texto que lo acompaña.
 */
const A_GLYPH =
  "M0 39 L14.5 0 L29 39 L21.1 39 L18.9 30.3 L10.1 30.3 L7.9 39 Z " +
  "M11.2 26 L17.8 26 L14.5 13.3 Z";

/** Medidas del glifo suelto, en sus propias unidades (`viewBox`). */
const GLYPH_WIDTH = 29;
const GLYPH_HEIGHT = 39;

/** Destello de cuatro puntas: la chispa que da nombre a Asternal. */
const SPARK = "M45.5 10.3 L46.9 14.1 L50.7 15.5 L46.9 16.9 L45.5 20.7 L44.1 16.9 L40.3 15.5 L44.1 14.1 Z";

/**
 * Los dos azules del logotipo: el de la «A» y el de «sternal» son los mismos.
 *
 * Salen de los tokens del tema (`--primary` y su variante clara
 * `--primary-glow`, la misma pareja que usan los botones y los avisos de la
 * aplicación). Antes la letra llevaba azules fijos y la palabra el color del
 * texto, así que se leían como dos piezas distintas; ahora comparten degradado y
 * se adaptan solos al tema claro u oscuro, donde el azul de marca es más claro.
 */
const BRAND_BLUE = "var(--primary)";
const BRAND_BLUE_SOFT = "color-mix(in oklab, var(--primary-glow) 35%, var(--primary))";

interface MarkProps {
  /** Lado del cuadrado, en px. */
  size?: number;
  className?: string;
  /** Nombre accesible del icono. */
  title?: string;
}

export function AsternalMark({ size = 40, className = "", title = "Asternal" }: MarkProps) {
  // Ids únicos por instancia: varias marcas en la misma pantalla no comparten
  // (ni se pisan) los degradados.
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const bgId = `ast-bg-${rawId}`;
  const glossId = `ast-gloss-${rawId}`;
  const clipId = `ast-clip-${rawId}`;
  const edgesId = `ast-edge-${rawId}`;
  const letterId = `ast-a-${rawId}`;
  const rimId = `ast-rim-${rawId}`;
  const glowId = `ast-glow-${rawId}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={bgId} x1="6" y1="2" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2f66d6" />
          <stop offset="0.55" stopColor="#3f83e6" />
          <stop offset="1" stopColor="#54b6ea" />
        </linearGradient>
        {/* Brillo diagonal de la esquina superior. */}
        <linearGradient id={glossId} x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* La letra: platino con un fondo azulado, en coordenadas del icono para
            que el degradado siga siendo continuo en todo el trazo. */}
        <linearGradient id={letterId} x1="32" y1="11" x2="32" y2="53" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#f4faff" />
          <stop offset="1" stopColor="#c7e3ff" />
        </linearGradient>
        {/* Luz de canto del trazo derecho. */}
        <linearGradient id={rimId} x1="33" y1="15" x2="46" y2="51" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#7fd0ff" stopOpacity="0.15" />
        </linearGradient>
        {/* Halo que separa la letra del fondo. */}
        <radialGradient id={glowId} cx="32" cy="30" r="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={edgesId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="64" height="64" rx="17" />
        </clipPath>
      </defs>

      {/* Cuadro con el degradado de marca */}
      <rect x="0" y="0" width="64" height="64" rx="17" fill={`url(#${bgId})`} />

      {/* Luces y sombras suaves, recortadas al cuadro redondeado */}
      <g clipPath={`url(#${clipId})`}>
        <path d="M0 0 H30 L0 44 Z" fill={`url(#${glossId})`} />
        <circle cx="53" cy="55" r="20" fill="#0b1c3a" opacity="0.10" />
        <ellipse cx="32" cy="31" rx="20" ry="21" fill={`url(#${glowId})`} />

        {/* Sombra de la letra: se ve tallada sobre el degradado */}
        <path d={A_OUTLINE} transform="translate(1.2 1.6)" fill="#0b1c3a" opacity="0.30" fillRule="evenodd" />

        {/* La letra «A», con borde claro para que no pierda filo */}
        <path
          d={A_OUTLINE}
          fill={`url(#${letterId})`}
          fillRule="evenodd"
          stroke="#f2f9ff"
          strokeWidth="0.6"
          strokeOpacity="0.75"
          strokeLinejoin="round"
        />
        {/* Canto iluminado del trazo derecho */}
        <path d="M32 16 L44.8 50.4" fill="none" stroke={`url(#${rimId})`} strokeWidth="1.2" strokeLinecap="round" />

        {/* Destello */}
        <circle cx="45.5" cy="15.5" r="7.5" fill="#ffffff" opacity="0.12" />
        <path d={SPARK} fill="#ffffff" opacity="0.95" />
      </g>

      {/* Brillo del borde superior */}
      <rect x="1" y="1" width="62" height="62" rx="16" fill="none" stroke={`url(#${edgesId})`} strokeWidth="2" />
    </svg>
  );
}

interface LetterAProps {
  /** Alto del glifo, en px, de la línea base al vértice. */
  height?: number;
  className?: string;
}

/**
 * La «A» del logotipo, suelta y sin cuadro.
 *
 * Es el mismo trazo que lleva el icono, recortado a su contorno exacto y con el
 * vértice arriba y la línea base abajo: así se apoya sobre la línea base del
 * nombre y puede hacer de primera letra, del mismo alto que una mayúscula.
 *
 * Va pintada con el mismo degradado que «sternal» —los dos azules de marca del
 * tema, de arriba abajo— y lleva un halo azul desenfocado por detrás que le da
 * volumen (el mismo truco de luz del cuadro, pero suelto, sin caja). El halo va
 * en unidades del propio glifo, así que se escala con la letra y se ve igual de
 * fino a 16 px que a 56 px.
 */
export function AsternalLetterA({ height = 40, className = "" }: LetterAProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fillId = `ast-word-a-${rawId}`;
  const glowId = `ast-word-a-glow-${rawId}`;
  const width = Math.round((height * GLYPH_WIDTH) / GLYPH_HEIGHT * 100) / 100;

  return (
    <svg
      viewBox={`0 0 ${GLYPH_WIDTH} ${GLYPH_HEIGHT}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Vertical y en coordenadas del glifo, con los mismos dos azules del
            nombre: la letra y la palabra bajan del mismo azul al mismo azul. */}
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2={GLYPH_HEIGHT} gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: BRAND_BLUE }} />
          <stop offset="1" style={{ stopColor: BRAND_BLUE_SOFT }} />
        </linearGradient>
        {/* Halo: la caja del filtro se abre lo justo para que el desenfoque no
            se recorte en el vértice ni en las patas. */}
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* Luz azul por detrás de la letra: le da profundidad sobre el fondo. */}
      <path d={A_GLYPH} style={{ fill: BRAND_BLUE_SOFT }} opacity="0.45" filter={`url(#${glowId})`} fillRule="evenodd" />
      {/* La letra, con el degradado de marca. */}
      <path d={A_GLYPH} fill={`url(#${fillId})`} fillRule="evenodd" />
    </svg>
  );
}

/** El nombre completo, tal y como se lee (y como lo anuncia el lector de pantalla). */
const BRAND_NAME = "Asternal";

/** El nombre sin su primera letra: la «A» la pone la letra del logo. */
const WORDMARK = "sternal";

/**
 * Cuánto se reduce el nombre respecto al tamaño de marca.
 *
 * `size` es el alto del logotipo; el texto se dibuja algo más pequeño para que
 * la palabra no compita con la altura total de la línea y el conjunto quede
 * equilibrado.
 */
const TEXT_TO_BRAND_RATIO = 0.82;

/**
 * Alto de la mayúscula respecto al tamaño de fuente (Roboto/Space Grotesk
 * rondan 0,71 em). Es lo que mide la «A» para que su vértice quede a la altura
 * de las mayúsculas del nombre.
 */
const CAP_HEIGHT = 0.71;

/**
 * Separación entre la «A» y «sternal», en em.
 *
 * El propio trazo de la «A» llega hasta el borde de su caja, así que el hueco
 * real lo suma su espacio lateral: con este valor el interletrado queda igual
 * de apretado que el de las letras de «sternal» entre sí.
 */
const LETTER_GAP_EM = 0.03;

/**
 * Relleno del nombre: exactamente los dos azules de la «A».
 *
 * El degradado va recortado a las letras (`background-clip: text`) y sus topes
 * caen en la banda que ocupan los glifos —de la altura de mayúscula a la línea
 * base, que en esta caja de texto va del 15 % al 85 %— para que «sternal»
 * recorra la misma rampa que la letra y no un trozo distinto de ella.
 *
 * Va en `style` y no en utilidades de Tailwind para colgar directamente de los
 * tokens del tema (los mismos que usan los botones y los fondos de la pantalla
 * de acceso) con `color-mix`, sin depender de que se genere ninguna clase.
 */
const WORDMARK_FILL: CSSProperties = {
  backgroundImage: `linear-gradient(to bottom, ${BRAND_BLUE} 15%, ${BRAND_BLUE_SOFT} 85%)`,
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  color: "transparent",
};

interface LogoProps {
  /** Alto del logotipo, en px (el nombre se escala a partir de él). */
  size?: number;
  /** Muestra el nombre. Sin él, el logotipo es el icono de la aplicación. */
  showWordmark?: boolean;
  className?: string;
  /** Tamaño del texto del nombre, en px. Si se indica, manda sobre `size`. */
  textSize?: number;
}

/**
 * Logotipo: el nombre «Asternal» escrito como una sola palabra.
 *
 * La primera letra es la «A» del logo —su mismo trazo, sin el cuadro del icono—
 * apoyada en la línea base y del alto de una mayúscula, y a continuación sigue
 * «sternal» con la tipografía del producto. No hay una segunda «A»: la letra
 * del icono es la del nombre.
 *
 * Con `showWordmark={false}` se dibuja solo el icono (el cuadro con la «A»),
 * que es lo que corresponde cuando el logotipo hace de marca de la aplicación.
 */
export function AsternalLogo({ size = 40, showWordmark = true, className = "", textSize }: LogoProps) {
  if (!showWordmark) return <AsternalMark size={size} className={className} />;

  const fontSize = textSize ?? Math.round(size / TEXT_TO_BRAND_RATIO);

  return (
    <span
      role="img"
      aria-label={BRAND_NAME}
      className={`inline-flex items-baseline ${className}`}
      style={{ fontSize, lineHeight: 1, columnGap: `${LETTER_GAP_EM}em` }}
    >
      <AsternalLetterA height={Math.round(fontSize * CAP_HEIGHT)} className="shrink-0" />
      {/* El nombre visible continúa la letra del logo; su lectura para lectores
          de pantalla la da el propio logotipo («Asternal»), así que aquí se
          oculta para no repetirla. */}
      <span aria-hidden="true" className="font-display font-bold tracking-tight" style={WORDMARK_FILL}>
        {WORDMARK}
      </span>
    </span>
  );
}
