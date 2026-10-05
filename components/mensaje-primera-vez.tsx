"use client"

import { useEffect } from "react"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { Resultado } from "@/lib/acciones/resultado"

/**
 * The first video she ever opens (design Pass 3, step 5: "Extrañeza posible"). It is marked as seen when it appears,
 * so it shows in this visit and never again; a failed mark only means it shows once more.
 */
export function MensajeDePrimeraVez({ marcar }: { marcar: () => Promise<Resultado> }) {
  useEffect(() => {
    void marcar()
  }, [marcar])

  return <LineaDeEstado tipo="neutro" titulo="Así se ve tu avatar. Si algo no te calza, regrábalo." tituloEnTinta />
}
