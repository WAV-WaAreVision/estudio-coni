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
}

/** The buttons of a piece that is not waiting for a signature: retry, change the date or let it go (asking first). */
export function AccionesDeEstado({ piezaId, version, acciones }: PropiedadesDeEstado) {
  const { pendiente, error, ejecutar } = useAccion()
  const [descartando, setDescartando] = useState(false)
  return (
    <div className="grid gap-2">
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
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
              alConfirmar={() => ejecutar(() => ACCIONES[que](piezaId, version))}
              alVolver={() => setDescartando(false)}
            />
          ) : (
            <Boton key={que} variante="destructiva" onClick={() => setDescartando(true)}>
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
