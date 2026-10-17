"use client"

import { Warning } from "@phosphor-icons/react"
import { useEffect, useRef } from "react"
import { Boton } from "./boton"
import { ICONO } from "./icono"
import { LineaDeError } from "./linea-de-error"

interface PropiedadesDeConfirmacion {
  /** «gasto» and «neutro» confirm with the primary; «destructivo» with the raised destructive confirm and a secondary way back. */
  trato: "gasto" | "destructivo" | "neutro"
  pregunta: string
  confirmar: string
  volver: string
  alConfirmar: () => void
  alVolver: () => void
  cargando?: boolean
  /** A refused confirm, said inside the destructive block. */
  error?: string | null
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
  error = null,
}: PropiedadesDeConfirmacion) {
  const preguntaRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    preguntaRef.current?.focus()
  }, [])

  if (trato === "destructivo")
    // Like Desconectar LinkedIn (v6 6b): one honda block with the warning icon, its question, the two buttons and, when
    // the confirm was refused, the error line.
    return (
      <div data-contorno className="confirmacion grid gap-2.5 rounded-bloque bg-piedra-honda p-[14px]">
        <p ref={preguntaRef} tabIndex={-1} className="flex items-start gap-2.5 text-meta text-tinta outline-none">
          <Warning aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
          {pregunta}
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Boton variante="destructiva" tamano="chico" cargando={cargando} onClick={alConfirmar}>
            {confirmar}
          </Boton>
          <Boton variante="secundario" tamano="chico" onClick={alVolver}>
            {volver}
          </Boton>
        </div>
        {error ? <LineaDeError>{error}</LineaDeError> : null}
      </div>
    )

  return (
    <div className="confirmacion grid gap-3">
      <p ref={preguntaRef} tabIndex={-1} className="text-cuerpo outline-none">
        {pregunta}
      </p>
      <Boton cargando={cargando} onClick={alConfirmar}>
        {confirmar}
      </Boton>
      <Boton variante="callado" onClick={alVolver}>
        {volver}
      </Boton>
    </div>
  )
}
