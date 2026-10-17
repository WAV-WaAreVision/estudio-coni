"use client"

import { useCallback, useState } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import type { Resultado } from "@/lib/acciones/resultado"
import { textoDePropuestas, textoPorRepartir } from "@/lib/calendario/propuestas"

/**
 * Decision 25: the unsigned pieces without a proposal get the places the Agenda shows them in. Always mounted, so
 * its toast outlives the block once the page refreshes with nothing left to spread.
 */
export function RepartirFechas({
  cuantas,
  repartir,
}: {
  cuantas: number
  repartir: () => Promise<Resultado<{ propuestas: number }>>
}) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const redibujar = useRedibujar()
  const { pendiente, error, ejecutar } = useAccion()
  const cerrar = useCallback(() => setMensaje(null), [])

  function tocar() {
    ejecutar(repartir, (resultado) => {
      setMensaje(textoDePropuestas(resultado.propuestas))
      redibujar()
    })
  }

  return (
    <>
      {cuantas > 0 ? (
        <section aria-label="Fechas propuestas" className="grid justify-items-start gap-2 py-1">
          <p className="text-cuerpo font-semibold">{textoPorRepartir(cuantas)}</p>
          <p className="text-meta text-apagado">
            Les propongo los próximos espacios libres. La fecha la firmas en el video.
          </p>
          {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
          <Boton variante="secundario" tamano="chico" cargando={pendiente} onClick={tocar}>
            Repartir fechas
          </Boton>
        </section>
      ) : null}
      {mensaje ? <Aviso mensaje={mensaje} alCerrar={cerrar} /> : null}
    </>
  )
}
