"use client"

import { Check } from "@phosphor-icons/react"
import { useId } from "react"
import { cn } from "@/lib/utils"
import { ICONO } from "./icono"

interface PropiedadesDeCasilla {
  etiqueta: string
  /** A line under the label (the pillar of an idea): it describes the box without becoming part of its name. */
  detalle?: string
  marcada: boolean
  /** At the limit the box reads as disabled but stays focusable, so a screen reader can find it and read why. */
  deshabilitada?: boolean
  alCambiar: (marcada: boolean) => void
}

/** Decision 4: a sunken 1.65rem box with a campo ring inside a 3.25rem row that is all target. */
export function Casilla({ etiqueta, detalle, marcada, deshabilitada = false, alCambiar }: PropiedadesDeCasilla) {
  const idEtiqueta = useId()
  const idDetalle = useId()
  return (
    <label
      className={cn(
        "relative grid min-h-boton cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[14px] py-2 text-cuerpo font-semibold",
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
          "grid size-casilla place-items-center rounded-casilla",
          detalle ? "self-start" : "self-center",
          marcada
            ? "bg-tinta text-luz shadow-hundido-marcado"
            : deshabilitada
              ? "bg-piedra-honda"
              : "bg-piedra-honda shadow-hundido outline-2 outline-campo",
        )}
      >
        {marcada ? <Check weight="bold" size={ICONO.mini} /> : null}
      </span>
      <span className="grid">
        <span id={idEtiqueta}>{etiqueta}</span>
        {detalle ? (
          <span id={idDetalle} className="text-meta font-medium text-apagado">
            {detalle}
          </span>
        ) : null}
      </span>
    </label>
  )
}
