"use client"

import { useEffect, useRef } from "react"
import { Boton } from "./boton"

interface PropiedadesDeConfirmacion {
  /** «gasto» and «neutro» confirm with the primary; «destructivo» with the raised destructive confirm and a secondary way back. */
  trato: "gasto" | "destructivo" | "neutro"
  pregunta: string
  confirmar: string
  volver: string
  alConfirmar: () => void
  alVolver: () => void
  cargando?: boolean
}

/** The confirmation appears in line where the action was; its question takes focus so it is heard. */
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

  return (
    <div className="confirmacion grid gap-3">
      <p ref={preguntaRef} tabIndex={-1} className="text-cuerpo outline-none">
        {pregunta}
      </p>
      {trato === "destructivo" ? (
        <div className="flex flex-wrap gap-2.5">
          <Boton variante="destructiva" tamano="chico" cargando={cargando} onClick={alConfirmar}>
            {confirmar}
          </Boton>
          <Boton variante="secundario" tamano="chico" onClick={alVolver}>
            {volver}
          </Boton>
        </div>
      ) : (
        <>
          <Boton cargando={cargando} onClick={alConfirmar}>
            {confirmar}
          </Boton>
          <Boton variante="callado" onClick={alVolver}>
            {volver}
          </Boton>
        </>
      )}
    </div>
  )
}
