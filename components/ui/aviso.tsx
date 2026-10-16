"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export const DURACION_DEL_AVISO_MS = 8000

interface PropiedadesDeAviso {
  mensaje: string
  alCerrar: () => void
  alDeshacer?: () => void
  /**
   * Given when the caller tracks its undo: the toast then stays, with "Deshaciendo…", until the caller closes it on
   * the result. Without it the toast closes as soon as "Deshacer" is tapped.
   */
  deshaciendo?: boolean
  /** Focus "Deshacer" on mount, for a toast whose undo is what she most likely wants next. */
  enfocarDeshacer?: boolean
  duracionMs?: number
  /** On Guion and Video the sign bar, not the bottom nav, sits under the toast. */
  sobreBarra?: boolean
}

/** Brandkit 9.23: the toast. Ink background, gone after 8 s, with "Deshacer" only when the action can be undone. */
export function Aviso({
  mensaje,
  alCerrar,
  alDeshacer,
  deshaciendo,
  enfocarDeshacer = false,
  duracionMs = DURACION_DEL_AVISO_MS,
  sobreBarra = false,
}: PropiedadesDeAviso) {
  // A live region is announced when its content changes, not when it arrives already filled: it mounts empty.
  const [montado, setMontado] = useState(false)
  const botonDeshacer = useRef<HTMLButtonElement>(null)
  const sigueDeshaciendo = deshaciendo === true

  useEffect(() => {
    setMontado(true)
    if (enfocarDeshacer) botonDeshacer.current?.focus()
  }, [enfocarDeshacer])

  useEffect(() => {
    // An undo on its way decides how the toast ends; the timer must not close it first.
    if (sigueDeshaciendo) return
    const temporizador = setTimeout(alCerrar, duracionMs)
    return () => clearTimeout(temporizador)
  }, [alCerrar, duracionMs, sigueDeshaciendo])

  return (
    <output
      className={cn(
        "aviso fixed inset-x-5 z-20 mx-auto flex max-w-[520px] items-center justify-between gap-3 rounded-12 bg-tinta px-4 py-3 text-cuerpo text-sobre-tinta shadow-flotante",
        sobreBarra
          ? "bottom-[calc(var(--barra-max)+12px+env(safe-area-inset-bottom))]"
          : "bottom-[calc(56px+12px+env(safe-area-inset-bottom))]",
      )}
    >
      <span>{montado ? mensaje : null}</span>
      {alDeshacer ? (
        <button
          ref={botonDeshacer}
          type="button"
          // aria-disabled, not disabled: the button keeps her focus while the undo is on its way.
          aria-disabled={sigueDeshaciendo || undefined}
          className="min-h-11 px-2 font-semibold text-sobre-tinta underline aria-disabled:no-underline"
          onClick={() => {
            if (sigueDeshaciendo) return
            alDeshacer()
            if (deshaciendo === undefined) alCerrar()
          }}
        >
          {sigueDeshaciendo ? "Deshaciendo…" : "Deshacer"}
        </button>
      ) : null}
    </output>
  )
}
