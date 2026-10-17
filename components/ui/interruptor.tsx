"use client"

import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface PropiedadesDeInterruptor extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role" | "type"> {
  encendido: boolean
}

/**
 * Decision 4: a 3.25 x 2rem switch. Off: a sunken track with a campo ring and a raised thumb; on: ink and light.
 * Decision 7: the lit track carries a contour and the thumb paints CanvasText, so forced colours keep both states.
 */
export function Interruptor({ encendido, className, ...resto }: PropiedadesDeInterruptor) {
  return (
    <button
      {...resto}
      type="button"
      role="switch"
      aria-checked={encendido}
      data-contorno={encendido ? "" : undefined}
      className={cn(
        "flex h-interruptor-alto w-interruptor-ancho shrink-0 items-center rounded-control px-1",
        encendido ? "bg-tinta" : "bg-piedra-honda shadow-hundido outline-2 -outline-offset-2 outline-campo",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-[calc(2rem-8px)] rounded-full transition-transform forced-colors:forced-color-adjust-none forced-colors:bg-[color:CanvasText] duration-[var(--dur-corta)] ease-salida motion-reduce:transition-none",
          encendido ? "translate-x-[1.25rem] bg-luz" : "bg-piedra shadow-relieve-perilla",
        )}
      />
    </button>
  )
}
