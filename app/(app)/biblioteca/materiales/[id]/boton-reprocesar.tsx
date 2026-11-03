"use client"

import type { Rol } from "@/lib/dominio/biblioteca/modelo"
import { reprocesarMaterialAccion } from "../../acciones"
import { BotonQuePregunta } from "../../boton-que-pregunta"

export const PREGUNTA_REPROCESAR =
  "Reprocesar cuesta más o menos lo mismo que la primera vez. Se borran las ideas sacadas de este material y se vuelven a sacar."

export const PREGUNTA_REPROCESAR_ESTRATEGIA =
  "Reprocesar cuesta más o menos lo mismo que la primera vez. La ficha de este material se reemplaza por una nueva, también lo que editaste."

export function BotonReprocesar({ materialId, rol }: { materialId: string; rol: Rol }) {
  return (
    <BotonQuePregunta
      etiqueta="Reprocesar"
      pregunta={rol === "estrategia" ? PREGUNTA_REPROCESAR_ESTRATEGIA : PREGUNTA_REPROCESAR}
      confirmar="Sí, reprocesar"
      alConfirmar={() => reprocesarMaterialAccion(materialId)}
    />
  )
}
