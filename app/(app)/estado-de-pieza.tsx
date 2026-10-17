"use client"

import { ArrowCounterClockwise } from "@phosphor-icons/react"
import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { cambiarFechaAccion, descartarAccion, reintentarAccion, reintentarGuionAccion } from "./piezas/acciones"

type Que = "reintentar" | "reintentarGuion" | "cambiarFecha" | "descartar"

const ETIQUETAS: Record<Que, string> = {
  reintentar: "Reintentar",
  reintentarGuion: "Reintentar",
  cambiarFecha: "Cambiar la fecha",
  descartar: "Descartar esta pieza",
}

const ACCIONES: Record<Que, (piezaId: string, version: number) => ReturnType<typeof reintentarAccion>> = {
  reintentar: reintentarAccion,
  reintentarGuion: reintentarGuionAccion,
  cambiarFecha: cambiarFechaAccion,
  descartar: descartarAccion,
}

// Copy nuevo (brandkit 13.2, open question 2): Federico confirms the words before this ships.
export const PREGUNTA_DESCARTAR_PIEZA = "Se descarta esta pieza y no sale. ¿Seguro?"

interface PropiedadesDeEstado {
  piezaId: string
  version: number
  /** The buttons the state offers, in order; the first one is the main one. */
  acciones: readonly Que[]
  /**
   * The buttons sit inside a large error block that is already the alert: a refusal is a plain error line in it, read
   * by that alert, not a second honda block with its own.
   */
  enUnError?: boolean
}

/** The buttons of a piece that is not waiting for a signature: retry or change the date, or let it go quietly (asking first). */
export function AccionesDeEstado({ piezaId, version, acciones, enUnError = false }: PropiedadesDeEstado) {
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  const [descartando, setDescartando] = useState(false)
  return (
    <div className="grid gap-2">
      {/* A refused discard is said inside its own confirmation block. */}
      {error && enUnError && !descartando ? <p className="font-semibold text-error">{error}</p> : null}
      {error && !enUnError && !descartando ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      {acciones.map((que, indice) => {
        if (que === "descartar") {
          return descartando ? (
            <ConfirmacionEnLinea
              key={que}
              trato="destructivo"
              pregunta={PREGUNTA_DESCARTAR_PIEZA}
              confirmar="Sí, descartar"
              volver="Volver"
              cargando={pendiente}
              error={error}
              alConfirmar={() => ejecutar(() => ACCIONES[que](piezaId, version))}
              alVolver={() => setDescartando(false)}
            />
          ) : (
            <Boton
              key={que}
              variante="callado"
              onClick={() => {
                // A refusal of another button is not this question's: it opens without it.
                limpiarError()
                setDescartando(true)
              }}
            >
              {ETIQUETAS[que]}
            </Boton>
          )
        }
        return (
          <Boton
            key={que}
            variante={indice === 0 ? "primario" : "callado"}
            cargando={pendiente}
            icono={
              que === "reintentar" || que === "reintentarGuion" ? (
                <ArrowCounterClockwise aria-hidden="true" size={ICONO.medio} />
              ) : undefined
            }
            onClick={() => ejecutar(() => ACCIONES[que](piezaId, version))}
          >
            {ETIQUETAS[que]}
          </Boton>
        )
      })}
    </div>
  )
}
