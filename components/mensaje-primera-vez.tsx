"use client"

import { useEffect } from "react"
import { Panel } from "@/components/ui/panel"
import type { Resultado } from "@/lib/acciones/resultado"

/**
 * The first video she ever opens (design Pass 3, step 5: "Extrañeza posible"), as a reading panel (decision 11, step 4).
 * It is marked as seen when it appears, so it shows in this visit and never again; a failed mark only means it shows once
 * more.
 */
export function MensajeDePrimeraVez({ marcar }: { marcar: () => Promise<Resultado> }) {
  useEffect(() => {
    void marcar()
  }, [marcar])

  return (
    <Panel>
      <p className="text-cuerpo">Así se ve tu avatar. Si algo no te calza, regrábalo.</p>
    </Panel>
  )
}
