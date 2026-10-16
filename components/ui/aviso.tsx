"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

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
  /** "nav": above the bottom nav. "arriba": at the top, on a screen with a sign bar (answered question 2). */
  lugar?: "nav" | "arriba"
}

/**
 * Decisions 4 and 6: the toast, in ink with high relief, gone after 8 s, with "Deshacer" only when the action can be
 * undone. Portalled to <body>, so a screen's layout never moves it; globals.css places it by `data-lugar`.
 */
export function Aviso({
  mensaje,
  alCerrar,
  alDeshacer,
  deshaciendo,
  enfocarDeshacer = false,
  duracionMs = DURACION_DEL_AVISO_MS,
  lugar = "nav",
}: PropiedadesDeAviso) {
  // A live region is announced when its content changes, not when it arrives already filled: it mounts empty in
  // <body> on one commit and gets its message on the next.
  const [montado, setMontado] = useState(false)
  const [lleno, setLleno] = useState(false)
  const botonDeshacer = useRef<HTMLButtonElement>(null)
  const sigueDeshaciendo = deshaciendo === true

  useEffect(() => {
    setMontado(true)
  }, [])

  useEffect(() => {
    if (!montado) return
    setLleno(true)
    if (enfocarDeshacer) botonDeshacer.current?.focus()
  }, [montado, enfocarDeshacer])

  useEffect(() => {
    // An undo on its way decides how the toast ends; the timer must not close it first.
    if (sigueDeshaciendo) return
    const temporizador = setTimeout(alCerrar, duracionMs)
    return () => clearTimeout(temporizador)
  }, [alCerrar, duracionMs, sigueDeshaciendo])

  if (!montado) return null
  return createPortal(
    <output
      data-lugar={lugar}
      className="aviso flex items-center gap-3 rounded-toast bg-tinta py-2.5 pr-2.5 pl-5 text-cuerpo font-semibold text-luz shadow-relieve-alto"
    >
      <span className="min-w-0 flex-1">{lleno ? mensaje : null}</span>
      {alDeshacer ? (
        <button
          ref={botonDeshacer}
          type="button"
          // aria-disabled, not disabled: the button keeps her focus while the undo is on its way.
          aria-disabled={sigueDeshaciendo || undefined}
          className="min-h-objetivo shrink-0 rounded-control bg-luz px-[18px] text-cuerpo font-semibold text-tinta focus-visible:outline-luz aria-disabled:opacity-70"
          onClick={() => {
            if (sigueDeshaciendo) return
            alDeshacer()
            if (deshaciendo === undefined) alCerrar()
          }}
        >
          {sigueDeshaciendo ? "Deshaciendo…" : "Deshacer"}
        </button>
      ) : null}
    </output>,
    document.body,
  )
}
