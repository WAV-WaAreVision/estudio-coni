"use client"

import { CaretLeft, MagnifyingGlass, Plus } from "@phosphor-icons/react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import type { MotivoDeDescarte } from "@/lib/acciones/ideas"
import type { Resultado } from "@/lib/acciones/resultado"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"
import type { PropuestaDeIdea } from "@/lib/proveedores/anthropic"
import { BusquedaDeIdeas } from "./busqueda-de-ideas"
import { CartaDeIdea } from "./carta-de-idea"
import { DescartarIdea } from "./descartar-idea"
import { type IdeaConfirmada, IdeaPropia } from "./idea-propia"

export interface AccionesDelBanco {
  usar: (ideaId: string) => Promise<Resultado>
  quitar: (ideaId: string) => Promise<Resultado>
  descartar: (ideaId: string, motivo: MotivoDeDescarte) => Promise<Resultado>
  proponer: (gancho: string, tema: string) => Promise<Resultado<{ propuesta: PropuestaDeIdea }>>
  crear: (idea: IdeaConfirmada) => Promise<Resultado<{ id: string }>>
}

const URL_DE_INGESTA = "https://conidolly-ingesta.vercel.app"

type Vista = "mazo" | "buscar" | "propia"

interface Mensaje {
  texto: string
  deshacer?: () => void
}

/**
 * The idea bank: one idea at a time on the tint of its pillar, with "Después" and "Usar esta" as buttons (never only a
 * swipe), a switch to search, and a way to write an idea of her own. `ideas` arrives in the order the deck shows it.
 */
export function BancoDeIdeas({ ideas, acciones }: { ideas: readonly IdeaDeBanco[]; acciones: AccionesDelBanco }) {
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
    <div className="grid gap-4.5">
      <header className="grid gap-1.5">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-label font-semibold text-acento"
        >
          <CaretLeft aria-hidden="true" size={20} />
          Inicio
        </Link>
        <div className="flex items-center justify-between gap-2.5">
          <h1 className="font-serif text-title">{buscando ? "Buscar ideas" : "Ideas"}</h1>
          <Boton
            variante="linea"
            tamano="chico"
            onClick={() => setVista(buscando ? "mazo" : "buscar")}
            className="shrink-0"
          >
            {buscando ? (
              "Una a la vez"
            ) : (
              <>
                <MagnifyingGlass aria-hidden="true" size={20} />
                Buscar
              </>
            )}
          </Boton>
        </div>
      </header>

      {buscando ? (
        <BusquedaDeIdeas
          ideas={ideas}
          sumadas={sumadas}
          alAbrir={(ideaId) => {
            setFrente(ideaId)
            setVista("mazo")
          }}
          alEscribirPropia={abrirPropia}
        />
      ) : actual ? (
        <div className="grid gap-3.5">
          {actual.nueva ? <p className="text-label font-semibold text-acento">Nuevas de la semana</p> : null}
          <p className="text-meta text-apagado" aria-live="polite">
            Idea {posicion} de {libres.length}
          </p>
          <div ref={carta} tabIndex={-1} className="outline-none">
            <CartaDeIdea key={actual.id} idea={actual} />
          </div>
          {error ? (
            <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Boton variante="linea" onClick={() => despues(actual)}>
              Después
            </Boton>
            <Boton cargando={pendiente} onClick={() => usar(actual)}>
              Usar esta
            </Boton>
          </div>
          <DescartarIdea key={actual.id} ocupada={pendiente} alElegir={(motivo) => descartar(actual, motivo)} />
          <BotonIdeaPropia alTocar={abrirPropia} />
        </div>
      ) : bancoVacio ? (
        <div className="grid justify-items-start gap-3.5 py-1">
          <p className="font-semibold">
            El motor propone ideas cada domingo a las 20:00. Mientras, sube material en Conidolly Ingesta.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_URL_INGESTA || URL_DE_INGESTA}
            className={clasesDeBoton({ variante: "linea", tamano: "chico" })}
          >
            Abrir Conidolly Ingesta
          </a>
          <BotonIdeaPropia alTocar={abrirPropia} />
        </div>
      ) : (
        <div className="grid gap-3.5 py-1">
          <p className="font-semibold">Usaste todas las ideas del banco. Escribe una idea nueva.</p>
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
      <Plus aria-hidden="true" size={20} />
      Escribir una idea mía
    </Boton>
  )
}
