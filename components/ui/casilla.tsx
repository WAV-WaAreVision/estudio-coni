"use client"

import { Check } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

interface PropiedadesDeCasilla {
  etiqueta: string
  marcada: boolean
  /** At the limit the box reads as disabled but stays focusable, so a screen reader can find it and read why. */
  deshabilitada?: boolean
  alCambiar: (marcada: boolean) => void
}

/** Brandkit 9.10: a round 24 px checkbox inside a 56 px row that is all target. */
export function Casilla({ etiqueta, marcada, deshabilitada = false, alCambiar }: PropiedadesDeCasilla) {
  return (
    <label
      className={cn(
        "grid min-h-14 cursor-pointer grid-cols-[24px_1fr] items-center gap-x-3 text-cuerpo",
        "has-[:focus-visible]:shadow-[var(--anillo-foco)]",
        deshabilitada && "cursor-not-allowed text-apagado",
      )}
    >
      <input
        type="checkbox"
        checked={marcada}
        aria-disabled={deshabilitada || undefined}
        onChange={() => {
          if (!deshabilitada) alCambiar(!marcada)
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-6 place-items-center rounded-full",
          marcada
            ? "bg-tinta"
            : cn("bg-superficie ring-[1.5px] ring-inset", deshabilitada ? "ring-linea" : "ring-campo"),
        )}
      >
        {marcada ? <Check weight="bold" size={14} className="text-sobre-tinta" /> : null}
      </span>
      <span>{etiqueta}</span>
    </label>
  )
}
