"use client"

import { reintentarMaterialAccion } from "./acciones"
import { BotonQuePregunta } from "./boton-que-pregunta"

export const PREGUNTA_REINTENTAR =
  "Vuelvo a procesar este material desde donde falló. Puede costar más o menos lo mismo que la primera vez."

export function BotonReintentar({ materialId }: { materialId: string }) {
  return (
    <BotonQuePregunta
      etiqueta="Reintentar"
      pregunta={PREGUNTA_REINTENTAR}
      confirmar="Sí, reintentar"
      alConfirmar={() => reintentarMaterialAccion(materialId)}
    />
  )
}
