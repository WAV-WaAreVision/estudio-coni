"use client"

import { useCallback, useState, useTransition } from "react"
import { BarraDeLote } from "@/components/barra-de-lote"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { Grupo } from "@/components/ui/grupo"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { MotivoDeDescarte } from "@/lib/acciones/ideas"
import type { InicioDeIdea, LoteElegido } from "@/lib/acciones/piezas"
import type { Resultado } from "@/lib/acciones/resultado"
import { MAXIMO_DE_IDEAS } from "@/lib/dominio/ideas"
import {
  botonDeAlcance,
  detalleDeAlcance,
  preguntaDeAlcance,
  textoDeDescartadas,
  textoDelLote,
  textoDeRestauradas,
} from "@/lib/dominio/lote"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"
import { DescartarIdea } from "./descartar-idea"

export interface AccionesDeEleccion {
  elegirVarias: (ideaIds: string[]) => Promise<Resultado<LoteElegido>>
  descartarVarias: (ideaIds: string[], motivo: MotivoDeDescarte) => Promise<Resultado>
  restaurar: (ideaIds: string[]) => Promise<Resultado<{ restauradas: string[] }>>
}

interface Mensaje {
  texto: string
  deshacer?: () => void
}

/**
 * Decisions 23 and 24: the free ideas as rows to tick, up to five, and one bar for what to do with them. Nothing
 * starts until she taps, and a smaller batch the month can pay for is asked, never assumed. The toast goes to the
 * top so it never covers the bar (amendment A11).
 */
export function EleccionDeIdeas({
  ideas,
  acciones,
  alSacar,
  alDevolver,
  alEmpezar,
}: {
  ideas: readonly IdeaDeBanco[]
  acciones: AccionesDeEleccion
  /** They left the bank from here (started or discarded): the screen stops offering them. */
  alSacar: (ideaIds: string[]) => void
  /** They came back with Deshacer. */
  alDevolver: (ideaIds: string[]) => void
  /** The scripts were asked for: the bar she was on may be gone, so the screen takes the focus. */
  alEmpezar: () => void
}) {
  const [elegidas, setElegidas] = useState<string[]>([])
  const [alcanza, setAlcanza] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [deshaciendo, setDeshaciendo] = useState(false)
  const [pendiente, empezar] = useTransition()
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  const enElMaximo = elegidas.length >= MAXIMO_DE_IDEAS
  const cuantas = elegidas.length

  function cambiar(ideaId: string, marcada: boolean) {
    setError(null)
    setAlcanza(null)
    setElegidas((previas) => (marcada ? [...previas, ideaId] : previas.filter((id) => id !== ideaId)))
  }

  function hacer(ideaIds: string[]) {
    setError(null)
    empezar(async () => {
      const resultado = await acciones.elegirVarias(ideaIds)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      if (resultado.tipo === "alcanza") {
        setAlcanza(resultado.cuantas)
        return
      }
      // Only an idea whose piece could not be created is back in the bank: it stays ticked to try again.
      const devueltas = resultado.resultados.filter((r) => r.tipo === "devuelta").map((r) => r.ideaId)
      const cuantasDe = (tipo: InicioDeIdea["tipo"]) => resultado.resultados.filter((r) => r.tipo === tipo).length
      setAlcanza(null)
      setElegidas((previas) => previas.filter((id) => devueltas.includes(id)))
      alSacar(ideaIds.filter((id) => !devueltas.includes(id)))
      setMensaje({
        texto: textoDelLote({
          empezadas: cuantasDe("empezada"),
          devueltas: devueltas.length,
          conAviso: cuantasDe("con_aviso"),
          noDisponibles: cuantasDe("no_disponible"),
        }),
      })
      alEmpezar()
    })
  }

  function descartar(motivo: MotivoDeDescarte) {
    const ideaIds = elegidas
    setError(null)
    empezar(async () => {
      const resultado = await acciones.descartarVarias(ideaIds, motivo)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setElegidas([])
      setAlcanza(null)
      alSacar(ideaIds)
      setMensaje({ texto: textoDeDescartadas(ideaIds.length), deshacer: () => restaurar(ideaIds) })
    })
  }

  function restaurar(ideaIds: string[]) {
    setDeshaciendo(true)
    empezar(async () => {
      const resultado = await acciones.restaurar(ideaIds)
      setDeshaciendo(false)
      if (!resultado.ok) {
        setMensaje(null)
        setError(resultado.error)
        return
      }
      alDevolver(resultado.restauradas)
      setMensaje({ texto: textoDeRestauradas(resultado.restauradas.length, ideaIds.length) })
    })
  }

  return (
    <div className="grid gap-4">
      <p className="text-meta text-apagado">
        Elige hasta {MAXIMO_DE_IDEAS} ideas para hacer sus guiones o descartarlas juntas.
      </p>
      {error && cuantas === 0 ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      {ideas.length === 0 ? (
        <p className="text-cuerpo font-semibold">No quedan ideas libres en el banco.</p>
      ) : (
        <Grupo lista>
          {ideas.map((idea) => {
            const marcada = elegidas.includes(idea.id)
            return (
              <li key={idea.id}>
                <Casilla
                  etiqueta={idea.gancho}
                  detalle={idea.nombreCortoPilar}
                  marcada={marcada}
                  deshabilitada={!marcada && enElMaximo}
                  alCambiar={(valor) => cambiar(idea.id, valor)}
                />
              </li>
            )
          })}
        </Grupo>
      )}
      {enElMaximo ? <p className="text-meta text-apagado">Llegaste al máximo de {MAXIMO_DE_IDEAS}.</p> : null}

      {cuantas > 0 ? (
        <BarraDeLote titulo="Ideas elegidas">
          {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
          {alcanza !== null ? (
            <>
              <p className="text-cuerpo font-semibold">{preguntaDeAlcance(alcanza)}</p>
              <p className="text-meta text-apagado">{detalleDeAlcance(alcanza)}</p>
              <Boton cargando={pendiente} onClick={() => hacer(elegidas.slice(0, alcanza))}>
                {botonDeAlcance(alcanza)}
              </Boton>
              <Boton variante="secundario" tamano="chico" className="w-fit" onClick={() => setAlcanza(null)}>
                Volver
              </Boton>
            </>
          ) : (
            <>
              <p className="text-meta font-semibold" aria-live="polite">
                {cuantas === 1 ? "1 elegida" : `${cuantas} elegidas`}
              </p>
              <Boton cargando={pendiente} onClick={() => hacer(elegidas)}>
                Hacer los guiones ({cuantas})
              </Boton>
              <DescartarIdea
                ocupada={pendiente}
                etiqueta={`Descartar (${cuantas})`}
                pregunta="¿Por qué las descartas?"
                alElegir={descartar}
              />
            </>
          )}
        </BarraDeLote>
      ) : null}

      {mensaje ? (
        <Aviso
          lugar="arriba"
          mensaje={mensaje.texto}
          alCerrar={cerrarMensaje}
          alDeshacer={mensaje.deshacer}
          enfocarDeshacer={mensaje.deshacer !== undefined}
          deshaciendo={mensaje.deshacer ? deshaciendo : undefined}
        />
      ) : null}
    </div>
  )
}
