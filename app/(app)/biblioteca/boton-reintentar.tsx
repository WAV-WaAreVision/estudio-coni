"use client"

import { useId } from "react"
import { LineaDeBloqueo } from "@/components/ui/linea-de-bloqueo"
import { reintentarMaterialAccion } from "./acciones"
import { BotonQuePregunta } from "./boton-que-pregunta"

export const PREGUNTA_REINTENTAR =
  "Vuelvo a procesar este material desde donde falló. Puede costar más o menos lo mismo que la primera vez."

/** `pausa`: the Biblioteca's pause text while Claude is paused (plan amendment A6); the button closes with it. */
export function BotonReintentar({ materialId, pausa = null }: { materialId: string; pausa?: string | null }) {
  const idDeLaPausa = useId()
  return (
    <div className="grid gap-1.5">
      <BotonQuePregunta
        etiqueta="Reintentar"
        pregunta={PREGUNTA_REINTENTAR}
        confirmar="Sí, reintentar"
        alConfirmar={() => reintentarMaterialAccion(materialId)}
        deshabilitado={pausa !== null}
        idDeLaRazon={idDeLaPausa}
      />
      {pausa !== null ? <LineaDeBloqueo id={idDeLaPausa}>{pausa}</LineaDeBloqueo> : null}
    </div>
  )
}
