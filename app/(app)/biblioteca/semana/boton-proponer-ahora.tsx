"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeSaldo } from "@/components/ui/costo"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import { MOTOR_PEDIDO, textoDeCosto } from "@/lib/dominio/biblioteca/semana"
import { proponerAhoraAccion } from "./acciones"

const ID_DEL_COSTO = "costo-de-proponer-ahora"

/**
 * Asks the engine for this week. The estimate sits under it (4a); the note stays while the screen redraws, since the
 * run's row only appears once the task starts.
 */
export function BotonProponerAhora({ costoUsd }: { costoUsd: number }) {
  const { pendiente, error, ejecutar } = useAccion()
  const redibujar = useRedibujar()
  const [pedido, setPedido] = useState(false)
  return (
    <div className="grid justify-items-start gap-2">
      <Boton
        cargando={pendiente}
        aria-describedby={ID_DEL_COSTO}
        onClick={() => {
          setPedido(false)
          ejecutar(proponerAhoraAccion, () => {
            setPedido(true)
            redibujar()
          })
        }}
      >
        Proponer ahora
      </Boton>
      <LineaDeSaldo id={ID_DEL_COSTO}>{textoDeCosto(costoUsd)}</LineaDeSaldo>
      {pedido ? <LineaDeEstado tipo="neutro" titulo={MOTOR_PEDIDO} /> : null}
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
