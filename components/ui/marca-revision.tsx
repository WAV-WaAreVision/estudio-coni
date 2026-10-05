"use client"

import type { Hallazgo } from "@/lib/dominio/revision"
import { Casilla } from "./casilla"
import { LineaDeEstado } from "./linea-de-estado"

interface PropiedadesDeMarca {
  hallazgo: Hallazgo
  confirmada: boolean
  alCambiar: (confirmada: boolean) => void
  /** A blocking finding listed under an error that already interrupted: it does not interrupt again. */
  anunciada?: boolean
}

/** Brandkit 9.7: one finding of the automatic review as a status line. A warning needs Coni's tick; a blocking one is fixed first. */
export function MarcaRevision({ hallazgo, confirmada, alCambiar, anunciada = false }: PropiedadesDeMarca) {
  const bloquea = hallazgo.tipo === "bloquea"
  const frase = hallazgo.frase ? (
    <>
      Frase marcada: <q>{hallazgo.frase}</q>
    </>
  ) : null
  return (
    <div className="grid gap-1">
      <LineaDeEstado
        tipo={bloquea ? "error" : "aviso"}
        rotulo={bloquea ? "Hay que corregirlo:" : "Para confirmar:"}
        titulo={hallazgo.mensaje}
        tituloEnTinta
        anunciada={anunciada}
        detalle={bloquea ? <>{frase ? <>{frase} </> : null}Sin esto no puedes aprobar.</> : frase}
      />
      {bloquea ? null : (
        <div className="pl-9">
          <Casilla etiqueta="Lo revisé y está bien" marcada={confirmada} alCambiar={alCambiar} />
        </div>
      )}
    </div>
  )
}
