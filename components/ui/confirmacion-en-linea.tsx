"use client"

import { useEffect, useRef } from "react"
import { Boton } from "./boton"

interface PropiedadesDeConfirmacion {
  /** «gasto» confirms with the principal, «destructivo» with an error outline (never filled), «neutro» with the principal. */
  trato: "gasto" | "destructivo" | "neutro"
  pregunta: string
  confirmar: string
  volver: string
  alConfirmar: () => void
  alVolver: () => void
  cargando?: boolean
}

/** Brandkit 9.5: the confirmation appears in line where the action was; its question takes focus so it is heard. */
export function ConfirmacionEnLinea({
  trato,
  pregunta,
  confirmar,
  volver,
  alConfirmar,
  alVolver,
  cargando = false,
}: PropiedadesDeConfirmacion) {
  const preguntaRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    preguntaRef.current?.focus()
  }, [])

  const destructivo = trato === "destructivo"
  return (
    <div className="confirmacion grid gap-2">
      <p ref={preguntaRef} tabIndex={-1} className="text-cuerpo outline-none">
        {pregunta}
      </p>
      <Boton
        variante={destructivo ? "linea" : "primario"}
        className={destructivo ? "border-error text-error" : undefined}
        cargando={cargando}
        onClick={alConfirmar}
      >
        {confirmar}
      </Boton>
      <Boton variante="callado" onClick={alVolver}>
        {volver}
      </Boton>
    </div>
  )
}
