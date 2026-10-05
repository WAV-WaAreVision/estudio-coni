"use client"

import { Plus } from "@phosphor-icons/react"
import { useCallback, useState } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"

interface PropiedadesDeConsulta {
  total: number
  /** The month in words, `octubre`. */
  mes: string
  alAnotar: () => Promise<Resultado<{ id: string; totalDelMes: number }>>
  alDeshacer: (id: string) => Promise<Resultado<{ totalDelMes: number }>>
}

function cuantas(total: number, mes: string): string {
  if (total === 0) return `Todavía ninguna en ${mes}`
  return `${total} ${total === 1 ? "consulta" : "consultas"} en ${mes}`
}

/** One tap per consultation that arrives. Only the moment is kept: no names, no reasons (design Premisa 5). */
export function ConsultaNueva({ total: inicial, mes, alAnotar, alDeshacer }: PropiedadesDeConsulta) {
  const [total, setTotal] = useState(inicial)
  const [anotada, setAnotada] = useState<{ id: string; totalDelMes: number } | null>(null)
  const { pendiente, error, ejecutar } = useAccion()
  // Stable, so the toast keeps its clock when the screen re-renders.
  const cerrarAviso = useCallback(() => setAnotada(null), [])

  function anotar() {
    ejecutar(alAnotar, (resultado) => {
      setTotal(resultado.totalDelMes)
      setAnotada({ id: resultado.id, totalDelMes: resultado.totalDelMes })
    })
  }

  function deshacer(id: string) {
    ejecutar(
      () => alDeshacer(id),
      (resultado) => setTotal(resultado.totalDelMes),
    )
  }

  return (
    <div className="grid gap-3">
      <p className="text-cuerpo font-semibold">{cuantas(total, mes)}</p>
      <Boton variante="linea" cargando={pendiente} icono={<Plus aria-hidden="true" size={20} />} onClick={anotar}>
        Llegó una consulta
      </Boton>
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      {anotada ? (
        <Aviso
          mensaje={`Anotada. Van ${anotada.totalDelMes} en ${mes}.`}
          alCerrar={cerrarAviso}
          alDeshacer={() => deshacer(anotada.id)}
        />
      ) : null}
    </div>
  )
}
