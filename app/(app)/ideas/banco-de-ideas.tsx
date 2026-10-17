"use client"

import { ArrowRight, MagnifyingGlass, Plus } from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Volver } from "@/components/ui/volver"
import type { MotivoDeDescarte } from "@/lib/acciones/ideas"
import type { Resultado } from "@/lib/acciones/resultado"
import type { PilarVisible } from "@/lib/dominio/pilares"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"
import { BusquedaDeIdeas } from "./busqueda-de-ideas"
import { CartaDeIdea } from "./carta-de-idea"
import { DescartarIdea } from "./descartar-idea"
import { type IdeaConfirmada, IdeaPropia, type PropuestaParaConfirmar } from "./idea-propia"

export interface AccionesDelBanco {
  usar: (ideaId: string) => Promise<Resultado>
  quitar: (ideaId: string) => Promise<Resultado>
  descartar: (ideaId: string, motivo: MotivoDeDescarte) => Promise<Resultado>
  proponer: (gancho: string, tema: string) => Promise<Resultado<{ propuesta: PropuestaParaConfirmar }>>
  crear: (idea: IdeaConfirmada) => Promise<Resultado<{ id: string }>>
}

const URL_DE_INGESTA = "https://conidolly-ingesta.vercel.app"

type Vista = "mazo" | "buscar" | "propia"

interface Mensaje {
  texto: string
  deshacer?: () => void
}

// "Usar esta" with its arrow wrapped inside a 151 px column at the 22 px inset: a tighter inset keeps it whole.
const PAR_DE_BOTONES = "gap-2 px-[18px] whitespace-nowrap"

/**
 * The idea bank: one idea at a time on the tint of its pillar, with "Después" and "Usar esta" as buttons (never only a
 * swipe), a switch to search, and a way to write an idea of her own. `ideas` arrives in the order the deck shows it.
 */
export function BancoDeIdeas({
  ideas,
  pilares,
  acciones,
}: {
  ideas: readonly IdeaDeBanco[]
  pilares: readonly PilarVisible[]
  acciones: AccionesDelBanco
}) {
  const [vista, setVista] = useState<Vista>("mazo")
  // Said "Después" to, in the order she did: they go to the back of the deck.
  const [aplazadas, setAplazadas] = useState<string[]>([])
  // Added to the week from this screen; the page refreshes behind them, but they are not offered again meanwhile.
  const [sumadas, setSumadas] = useState<string[]>([])
  // The idea she opened from the search, or brought back with Deshacer.
  const [frente, setFrente] = useState<string | null>(null)
  // Discarded from this screen; like the added ones they are not offered again while the page refreshes.
  const [descartadas, setDescartadas] = useState<string[]>([])
  const [enfocarCarta, setEnfocarCarta] = useState(false)
  const carta = useRef<HTMLDivElement>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  // Her next idea takes the place of the one she discarded: the screen reader goes with it.
  useEffect(() => {
    if (!enfocarCarta) return
    carta.current?.focus()
    setEnfocarCarta(false)
  }, [enfocarCarta])

  const libres = ideas.filter(
    (idea) => idea.estado === "idea" && !sumadas.includes(idea.id) && !descartadas.includes(idea.id),
  )
  const seguidas = libres.filter((idea) => !aplazadas.includes(idea.id))
  const alFinal = aplazadas.flatMap((id) => libres.find((idea) => idea.id === id) ?? [])
  const actual = libres.find((idea) => idea.id === frente) ?? [...seguidas, ...alFinal][0]
  const posicion = actual ? libres.indexOf(actual) + 1 : 0

  function despues(idea: IdeaDeBanco) {
    setError(null)
    setFrente(null)
    setAplazadas((previas) => [...previas.filter((id) => id !== idea.id), idea.id])
  }

  function usar(idea: IdeaDeBanco) {
    setError(null)
    empezar(async () => {
      const resultado = await acciones.usar(idea.id)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setSumadas((previas) => [...previas, idea.id])
      setFrente(null)
      setMensaje({ texto: "La sumé a las ideas de la semana.", deshacer: () => deshacer(idea.id) })
    })
  }

  function descartar(idea: IdeaDeBanco, motivo: MotivoDeDescarte) {
    setError(null)
    empezar(async () => {
      const resultado = await acciones.descartar(idea.id, motivo)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setDescartadas((previas) => [...previas, idea.id])
      setFrente(null)
      setEnfocarCarta(true)
      setMensaje({ texto: "Descarté la idea." })
    })
  }

  function deshacer(ideaId: string) {
    empezar(async () => {
      const resultado = await acciones.quitar(ideaId)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setSumadas((previas) => previas.filter((id) => id !== ideaId))
      setFrente(ideaId)
    })
  }

  function abrirPropia() {
    setError(null)
    setVista("propia")
  }

  if (vista === "propia") {
    return (
      <>
        <IdeaPropia
          proponer={acciones.proponer}
          crear={acciones.crear}
          pilares={pilares}
          alVolver={() => setVista("mazo")}
          alGuardar={() => {
            setVista("mazo")
            setMensaje({ texto: "Guardé tu idea y la sumé a las ideas de la semana." })
          }}
        />
        {mensaje ? <Aviso mensaje={mensaje.texto} alCerrar={cerrarMensaje} /> : null}
      </>
    )
  }

  const buscando = vista === "buscar"
  // The server gave her nothing free: the engine will. If she used the free ones up here, "Usaste todas" is the truth.
  const bancoVacio = ideas.every((idea) => idea.estado !== "idea")
  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <Volver href="/">Inicio</Volver>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-pantalla">{buscando ? "Buscar ideas" : "Ideas"}</h1>
          <Boton
            variante="callado"
            tamano="chico"
            onClick={() => setVista(buscando ? "mazo" : "buscar")}
            className="w-auto shrink-0"
          >
            {buscando ? (
              "Una a la vez"
            ) : (
              <>
                <MagnifyingGlass aria-hidden="true" size={ICONO.medio} />
                Buscar
              </>
            )}
          </Boton>
        </div>
      </header>

      {buscando ? (
        <BusquedaDeIdeas
          ideas={ideas}
          pilares={pilares}
          sumadas={sumadas}
          alAbrir={(ideaId) => {
            setFrente(ideaId)
            setVista("mazo")
          }}
          alEscribirPropia={abrirPropia}
        />
      ) : actual ? (
        <div className="grid gap-4">
          <div className="flex items-baseline justify-between gap-4 text-meta">
            <span className="font-semibold">{actual.nueva ? "Nuevas de la semana" : null}</span>
            <span className="text-apagado" aria-live="polite">
              Idea {posicion} de {libres.length}
            </span>
          </div>
          <div ref={carta} tabIndex={-1} className="outline-none">
            <CartaDeIdea key={actual.id} idea={actual}>
              {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
              {/* Side by side at 390 px, one per row at large text; neither label wraps inside its pill. */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2">
                <Boton variante="secundario" className={PAR_DE_BOTONES} onClick={() => despues(actual)}>
                  Después
                </Boton>
                <Boton
                  className={PAR_DE_BOTONES}
                  cargando={pendiente}
                  icono={<ArrowRight aria-hidden="true" size={ICONO.medio} />}
                  onClick={() => usar(actual)}
                >
                  Usar esta
                </Boton>
              </div>
            </CartaDeIdea>
          </div>
          <DescartarIdea key={actual.id} ocupada={pendiente} alElegir={(motivo) => descartar(actual, motivo)} />
          <BotonIdeaPropia alTocar={abrirPropia} />
        </div>
      ) : bancoVacio ? (
        <div className="grid justify-items-start gap-3 py-1">
          <p className="text-cuerpo font-semibold">
            El motor propone ideas cada domingo a las 20:00. Mientras, sube material en Conidolly Ingesta.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_URL_INGESTA || URL_DE_INGESTA}
            className={clasesDeBoton({ variante: "secundario", tamano: "chico" })}
          >
            Abrir Conidolly Ingesta
          </a>
          <BotonIdeaPropia alTocar={abrirPropia} />
        </div>
      ) : (
        <div className="grid gap-3 py-1">
          <p className="text-cuerpo font-semibold">Usaste todas las ideas del banco. Escribe una idea nueva.</p>
          <BotonIdeaPropia alTocar={abrirPropia} />
        </div>
      )}

      {mensaje ? <Aviso mensaje={mensaje.texto} alCerrar={cerrarMensaje} alDeshacer={mensaje.deshacer} /> : null}
    </div>
  )
}

function BotonIdeaPropia({ alTocar }: { alTocar: () => void }) {
  return (
    <Boton variante="callado" onClick={alTocar}>
      <Plus aria-hidden="true" size={ICONO.medio} />
      Escribir una idea mía
    </Boton>
  )
}
