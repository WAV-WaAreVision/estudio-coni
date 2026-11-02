"use client"

import { reprocesarMaterialAccion } from "../../acciones"
import { BotonQuePregunta } from "../../boton-que-pregunta"

export const PREGUNTA_REPROCESAR =
  "Reprocesar cuesta más o menos lo mismo que la primera vez. Se borran las ideas sacadas de este material y se vuelven a sacar."

export function BotonReprocesar({ materialId }: { materialId: string }) {
  return (
    <BotonQuePregunta
      etiqueta="Reprocesar"
      pregunta={PREGUNTA_REPROCESAR}
      confirmar="Sí, reprocesar"
      alConfirmar={() => reprocesarMaterialAccion(materialId)}
    />
  )
}
