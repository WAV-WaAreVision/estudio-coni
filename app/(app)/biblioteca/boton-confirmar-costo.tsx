"use client"

import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { dolares } from "@/lib/formato"
import { confirmarCostoAccion } from "./acciones"

/** A long material waits for her OK: the price is on the button, so the tap is the confirmation (D11). */
export function BotonConfirmarCosto({ materialId, costoUsd }: { materialId: string; costoUsd: number }) {
  const { pendiente, error, ejecutar } = useAccion()
  return (
    <div className="grid gap-2">
      <Boton
        variante="secundario"
        tamano="chico"
        className="w-fit"
        cargando={pendiente}
        onClick={() => ejecutar(() => confirmarCostoAccion(materialId))}
      >
        {`Procesar por ~${dolares(costoUsd)}`}
      </Boton>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
