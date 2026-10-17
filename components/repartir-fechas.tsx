"use client"

import { useCallback, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
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
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const cerrar = useCallback(() => setMensaje(null), [])

  function tocar() {
    setError(null)
    empezar(async () => {
      const resultado = await repartir()
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setMensaje(textoDePropuestas(resultado.propuestas))
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
