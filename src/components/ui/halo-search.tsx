"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Campo de búsqueda M3.
 *
 * Misma forma, borde y foco que el resto de campos de la app (los que fija
 * `src/glass.css`): borde `line-strong`, radio `--radius`, superficie
 * `card` y anillo de foco M3 de 3px en `--ring`. El tratamiento de foco vive
 * en el contenedor (`focus-within`), y el `<input>` interno queda sin contorno
 * ni sombra propios: así no aparece un recuadro dentro del campo ni ningún
 * efecto de ampliación al seleccionarlo.
 */
export interface HaloSearchInputProps
  extends Omit<
    React.ComponentPropsWithoutRef<"input">,
    "value" | "onChange" | "className"
  > {
  /** Valor controlado del campo. */
  value: string;
  /** Cambio de texto; el dueño guarda el valor. */
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Limpia el campo (el dueño decide si además cancela la petición en curso). */
  onClear?: () => void;
  /** Estado de carga: anima `loadingText`. */
  isLoading?: boolean;
  /** Texto que se revela carácter a carácter mientras carga. */
  loadingText?: string;
  /** Cadencia por carácter del texto de carga (segundos). */
  loadingStaggerSec?: number;
  /** Duración del ciclo de cada carácter (segundos). */
  loadingCharDurationSec?: number;
  /** Variante rellena de M3: usa la superficie container-high (`--muted`). */
  blobTranslucent?: boolean;
  /** Clases para el contenedor externo (no para el `<input>`). */
  className?: string;
}

export const HaloSearchInput = React.forwardRef<
  HTMLInputElement,
  HaloSearchInputProps
>(function HaloSearchInput(
  {
    value,
    onChange,
    onClear,
    isLoading = false,
    loadingText = "Buscando…",
    loadingStaggerSec = 0.044,
    loadingCharDurationSec = 0.42,
    blobTranslucent = false,
    className,
    placeholder,
    disabled,
    onFocus,
    onBlur,
    ...props
  },
  ref,
) {
  return (
    <div
      className={cn(
        // `.search-field` neutraliza el anillo propio del `<input>` interno
        // (glass.css): el único contorno del campo es este borde.
        "search-field group relative flex h-12 items-center gap-2.5 rounded-xl border px-4",
        "border-line-strong transition-[border-color,background-color] duration-200 ease-[var(--ease-out-smooth)]",
        blobTranslucent ? "bg-muted" : "bg-card",
        "focus-within:border-primary",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <Search
        size={17}
        aria-hidden
        className="shrink-0 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary"
      />

      <input
        ref={ref}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        className="h-full w-full min-w-0 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        {...props}
      />

      {isLoading && (
        <span
          role="status"
          className="shrink-0 font-mono text-[11px] tracking-wide text-primary"
        >
          {Array.from(loadingText).map((char, index) => (
            <span
              // El texto es estático: el índice es una clave estable.
              key={index}
              className="halo-char"
              style={{
                animationDelay: `${index * loadingStaggerSec}s`,
                animationDuration: `${loadingCharDurationSec}s`,
              }}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          ))}
        </span>
      )}

      {value.length > 0 && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpiar búsqueda"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
});
