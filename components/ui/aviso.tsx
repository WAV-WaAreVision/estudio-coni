"use client"

import { useEffect } from "react"
import { cn } from "@/lib/utils"

export const DURACION_DEL_AVISO_MS = 8000

interface PropiedadesDeAviso {
  mensaje: string
  alCerrar: () => void
  alDeshacer?: () => void
  duracionMs?: number
  /** On Guion and Video the sign bar, not the bottom nav, sits under the toast. */
  sobreBarra?: boolean
}

/** Brandkit 9.23: the toast. Ink background, gone after 8 s, with "Deshacer" only when the action can be undone. */
export function Aviso({
  mensaje,
  alCerrar,
  alDeshacer,
  duracionMs = DURACION_DEL_AVISO_MS,
  sobreBarra = false,
}: PropiedadesDeAviso) {
  useEffect(() => {
    const temporizador = setTimeout(alCerrar, duracionMs)
    return () => clearTimeout(temporizador)
  }, [alCerrar, duracionMs])

  return (
    <output
      className={cn(
        "aviso fixed inset-x-5 z-20 mx-auto flex max-w-[520px] items-center justify-between gap-3 rounded-12 bg-tinta px-4 py-3 text-cuerpo text-sobre-tinta shadow-flotante",
        sobreBarra
          ? "bottom-[calc(var(--barra-max)+12px+env(safe-area-inset-bottom))]"
          : "bottom-[calc(56px+12px+env(safe-area-inset-bottom))]",
      )}
    >
      <span>{mensaje}</span>
      {alDeshacer ? (
        <button
          type="button"
          className="min-h-11 px-2 font-semibold text-sobre-tinta underline"
          onClick={() => {
            alDeshacer()
            alCerrar()
          }}
        >
          Deshacer
        </button>
      ) : null}
    </output>
  )
}
