"use client"

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react"

/** Where the thumb counts as "approved" (DESIGN.md: 96 percent). */
export const UMBRAL_DE_APROBACION = 96
// With a step of 4 the keyboard reaches 96 exactly after 24 presses; End does it at once.
const PASO = 4

interface PropiedadesDeDeslizar {
  etiqueta: string
  /** False until the gate's conditions are met; the control stays focusable so a screen reader can read why. */
  habilitado: boolean
  /** What is missing, shown under the control when it is not enabled. */
  motivo?: string
  /** True while the approval travels to the server: the thumb stays at the end. */
  enviando?: boolean
  alAprobar: () => void
}

/** The one gesture that approves, on both gates: a native range input, so it works by touch, mouse and keyboard. */
export function DeslizarParaAprobar({
  etiqueta,
  habilitado,
  motivo,
  enviando = false,
  alAprobar,
}: PropiedadesDeDeslizar) {
  const [valor, setValor] = useState(0)
  const aprobado = useRef(false)
  const idMotivo = useId()
  const activo = habilitado && !enviando

  // The approval did not go through (or finished): the thumb goes back so she can try again.
  useEffect(() => {
    if (!enviando) {
      aprobado.current = false
      setValor((actual) => (actual >= UMBRAL_DE_APROBACION ? 0 : actual))
    }
  }, [enviando])

  function aprobar() {
    if (aprobado.current) return
    aprobado.current = true
    setValor(100)
    alAprobar()
  }

  function alMover(nuevo: number) {
    if (!activo) {
      setValor(0)
      return
    }
    if (nuevo >= UMBRAL_DE_APROBACION) {
      aprobar()
      return
    }
    setValor(nuevo)
  }

  function alSoltar() {
    if (!aprobado.current) setValor(0)
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "End") {
      evento.preventDefault()
      if (activo) aprobar()
    } else if (evento.key === "Home") {
      evento.preventDefault()
      if (!aprobado.current) setValor(0)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="relative h-15">
        <input
          type="range"
          min={0}
          max={100}
          step={PASO}
          value={valor}
          aria-label={etiqueta}
          aria-valuetext={valor >= UMBRAL_DE_APROBACION ? "Aprobado" : "No aprobado"}
          aria-disabled={!activo}
          aria-describedby={!habilitado && motivo ? idMotivo : undefined}
          onChange={(evento) => alMover(Number(evento.target.value))}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onBlur={alSoltar}
          onKeyDown={alTeclear}
          className={`deslizador h-15 w-full ${activo ? "cursor-pointer" : "cursor-not-allowed"}`}
          data-activo={activo}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 grid place-items-center text-label font-semibold ${activo ? "text-acento" : "text-apagado"}`}
          style={{ opacity: Math.max(0, 1 - valor / 55) }}
        >
          {etiqueta}
        </span>
      </div>
      {!habilitado && motivo ? (
        <p id={idMotivo} className="text-center text-meta text-apagado">
          {motivo}
        </p>
      ) : null}
    </div>
  )
}
