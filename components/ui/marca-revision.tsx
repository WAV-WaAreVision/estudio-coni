"use client"

import { useId } from "react"
import type { Hallazgo } from "@/lib/dominio/revision"

interface PropiedadesDeMarca {
  hallazgo: Hallazgo
  confirmada: boolean
  alCambiar: (confirmada: boolean) => void
}

/** One finding of the automatic review. A warning needs Coni's tick; a blocking one has to be fixed first. */
export function MarcaRevision({ hallazgo, confirmada, alCambiar }: PropiedadesDeMarca) {
  const idFrase = useId()
  const bloquea = hallazgo.tipo === "bloquea"

  return (
    <div
      className={`grid gap-2.5 rounded-md p-3.5 text-[1rem] ${bloquea ? "bg-error-fondo text-error-tinta" : "bg-aviso-fondo text-aviso-tinta"}`}
    >
      <p>
        <strong className="font-semibold text-tinta">{bloquea ? "Hay que corregirlo: " : "Para confirmar: "}</strong>
        {hallazgo.mensaje}
      </p>
      {hallazgo.frase ? (
        <p className="text-tinta">
          Frase marcada:{" "}
          <q id={idFrase} className="font-serif">
            {hallazgo.frase}
          </q>
        </p>
      ) : null}
      {bloquea ? (
        <p>Sin esto no puedes aprobar.</p>
      ) : (
        <label className="grid min-h-11 cursor-pointer grid-cols-[26px_1fr] items-center gap-2.5 text-tinta">
          <input
            type="checkbox"
            className="size-6 accent-acento"
            checked={confirmada}
            onChange={(evento) => alCambiar(evento.target.checked)}
          />
          <span>Lo revisé y está bien</span>
        </label>
      )}
    </div>
  )
}
