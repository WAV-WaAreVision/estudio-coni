"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { useAccion } from "@/components/use-accion"
import { descartarAccion } from "./piezas/acciones"

export const PREGUNTA_DESCARTAR_EN_LA_PUERTA = "¿Descartar esta pieza? No se puede deshacer."

/**
 * "Descartar esta pieza" on a gate (decision P2, approved by Federico on 2026-10-27): a quiet row that asks first, with
 * the raised destructive confirm (`Boton variante="destructiva"`, the error colour of DESIGN.md).
 */
export function DescartarPieza({ piezaId, version }: { piezaId: string; version: number }) {
  const [preguntando, setPreguntando] = useState(false)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()
  return preguntando ? (
    <ConfirmacionEnLinea
      trato="destructivo"
      pregunta={PREGUNTA_DESCARTAR_EN_LA_PUERTA}
      confirmar="Sí, descartar"
      volver="Cancelar"
      cargando={pendiente}
      error={error}
      alConfirmar={() => ejecutar(() => descartarAccion(piezaId, version))}
      alVolver={() => {
        limpiarError()
        setPreguntando(false)
      }}
    />
  ) : (
    <Boton variante="callado" onClick={() => setPreguntando(true)}>
      Descartar esta pieza
    </Boton>
  )
}
