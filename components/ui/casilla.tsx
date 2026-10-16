"use client"

import { Check } from "@phosphor-icons/react"
import { useId } from "react"
import { ICONO } from "@/components/ui/icono"
import { cn } from "@/lib/utils"

interface PropiedadesDeCasilla {
  etiqueta: string
  /** A line under the label (the pillar of an idea): it describes the box without becoming part of its name. */
  detalle?: string
  marcada: boolean
  /** At the limit the box reads as disabled but stays focusable, so a screen reader can find it and read why. */
  deshabilitada?: boolean
  alCambiar: (marcada: boolean) => void
}

/** Brandkit 9.10: a round 24 px checkbox inside a 56 px row that is all target. */
export function Casilla({ etiqueta, detalle, marcada, deshabilitada = false, alCambiar }: PropiedadesDeCasilla) {
  const idEtiqueta = useId()
  const idDetalle = useId()
  return (
    <label
      className={cn(
        "relative grid min-h-14 cursor-pointer grid-cols-[24px_1fr] items-center gap-x-3 py-2 text-cuerpo",
        "has-[:focus-visible]:shadow-[var(--anillo-foco)]",
        deshabilitada && "cursor-not-allowed text-apagado",
      )}
    >
      <input
        type="checkbox"
        checked={marcada}
        aria-labelledby={idEtiqueta}
        aria-describedby={detalle ? idDetalle : undefined}
        aria-disabled={deshabilitada || undefined}
        onChange={() => {
          if (!deshabilitada) alCambiar(!marcada)
        }}
        className="absolute inset-0 size-full cursor-[inherit] opacity-0"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-6 place-items-center self-start rounded-full",
          marcada
            ? "bg-tinta"
            : cn("bg-superficie ring-[1.5px] ring-inset", deshabilitada ? "ring-linea" : "ring-campo"),
        )}
      >
        {marcada ? <Check weight="bold" size={ICONO.mini} className="text-sobre-tinta" /> : null}
      </span>
      <span className="grid">
        <span id={idEtiqueta}>{etiqueta}</span>
        {detalle ? (
          <span id={idDetalle} className="text-meta text-apagado">
            {detalle}
          </span>
        ) : null}
      </span>
    </label>
  )
}
