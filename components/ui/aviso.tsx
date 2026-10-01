"use client"

import { useEffect } from "react"

export const DURACION_DEL_AVISO_MS = 4500

interface PropiedadesDeAviso {
  mensaje: string
  alCerrar: () => void
  alDeshacer?: () => void
  duracionMs?: number
}

/** The toast: ink background, gone after 4.5 s, with "Deshacer" only when the action can be undone. */
export function Aviso({ mensaje, alCerrar, alDeshacer, duracionMs = DURACION_DEL_AVISO_MS }: PropiedadesDeAviso) {
  useEffect(() => {
    const temporizador = setTimeout(alCerrar, duracionMs)
    return () => clearTimeout(temporizador)
  }, [alCerrar, duracionMs])

  return (
    <output className="aviso fixed inset-x-3.5 bottom-24 z-20 mx-auto flex max-w-[532px] items-center justify-between gap-2.5 rounded-md bg-tinta px-3.5 py-3 text-[1rem] text-fondo shadow-flotante">
      <span>{mensaje}</span>
      {alDeshacer ? (
        <button
          type="button"
          className="min-h-11 px-2 text-label font-semibold text-acento-claro"
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
