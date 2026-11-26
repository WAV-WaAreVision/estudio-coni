"use client"

import { Star } from "@phosphor-icons/react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { marcarFavoritoAccion } from "../acciones"

/** The star (spec 6b): a toggle with a stable name, its state in `aria-pressed`. The refreshed page brings the new one. */
export function BotonFavorito({ afirmacionId, favorito }: { afirmacionId: string; favorito: boolean }) {
  const { pendiente, error, ejecutar } = useAccion()
  return (
    <div className="grid justify-items-start gap-1">
      <Boton
        variante="secundario"
        tamano="chico"
        aria-pressed={favorito}
        cargando={pendiente}
        icono={<Star aria-hidden="true" weight={favorito ? "fill" : "regular"} size={ICONO.medio} />}
        onClick={() => ejecutar(() => marcarFavoritoAccion({ afirmacionId, favorito: !favorito }))}
      >
        Favorito
      </Boton>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
    </div>
  )
}
