"use client"

import { CheckCircle, Flag } from "@phosphor-icons/react"
import { useId } from "react"
import type { Hallazgo } from "@/lib/dominio/revision"
import { Bloque } from "./bloque"
import { Boton } from "./boton"
import { Casilla } from "./casilla"
import { ICONO } from "./icono"

interface PropiedadesDeMarca {
  hallazgo: Hallazgo
  confirmada: boolean
  alCambiar: (confirmada: boolean) => void
  /** A blocking finding listed under an error that already interrupted: it does not interrupt again. */
  anunciada?: boolean
  /** The panel's id: the marked phrase in the script links here. */
  id?: string
  /** The script above marks the phrase: the panel does not quote it again. */
  fraseResaltada?: boolean
  /** Gate 1: a blocking finding offers to open the editor. */
  alEditar?: () => void
}

function tituloDe(hallazgo: Hallazgo, confirmada: boolean): string {
  if (confirmada) return hallazgo.frase ? "Frase revisada" : "Revisado"
  return hallazgo.frase ? "Revisa la frase marcada" : "Revisa este punto"
}

/**
 * Decision 9: a warning is a flat review panel with today's checkbox; a blocking finding is an error block that has to
 * be fixed, not confirmed. No side rule (answered question 1): a flat background with a 1 px campo border.
 */
export function MarcaRevision({
  hallazgo,
  confirmada,
  alCambiar,
  anunciada = false,
  id,
  fraseResaltada = false,
  alEditar,
}: PropiedadesDeMarca) {
  const idTitulo = useId()
  const cita = hallazgo.frase && !fraseResaltada ? <q className="block text-cuerpo">{hallazgo.frase}</q> : null
  if (hallazgo.tipo === "bloquea") {
    return (
      <Bloque
        tipo="error"
        id={id}
        titulo="Hay que corregirlo"
        anunciada={anunciada}
        accion={
          alEditar ? (
            <Boton variante="callado" onClick={alEditar}>
              Editar el guion
            </Boton>
          ) : undefined
        }
      >
        <span className="grid gap-1">
          <span>{hallazgo.mensaje}</span>
          {cita}
          <span>Sin esto no puedes firmar.</span>
        </span>
      </Bloque>
    )
  }
  const Icono = confirmada ? CheckCircle : Flag
  return (
    <section
      id={id}
      aria-labelledby={idTitulo}
      data-contorno
      className="grid scroll-mt-4 gap-2 rounded-panel border border-campo bg-piedra-alta px-[18px] pt-[18px] pb-1.5"
    >
      <p id={idTitulo} className="flex items-center gap-2.5 text-cuerpo font-semibold">
        <Icono aria-hidden="true" size={ICONO.medio} className="shrink-0" />
        {tituloDe(hallazgo, confirmada)}
      </p>
      <p className="text-meta">{hallazgo.mensaje}</p>
      {cita}
      <Casilla etiqueta="Lo revisé y está bien" marcada={confirmada} alCambiar={alCambiar} />
    </section>
  )
}
