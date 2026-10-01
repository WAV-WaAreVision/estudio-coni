"use client"

import { ChevronLeft, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useCallback, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import type { Resultado } from "@/lib/acciones/resultado"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"
import type { PropuestaDeIdea } from "@/lib/proveedores/anthropic"
import { BusquedaDeIdeas } from "./busqueda-de-ideas"
import { CartaDeIdea } from "./carta-de-idea"
import { type IdeaConfirmada, IdeaPropia } from "./idea-propia"

export interface AccionesDelBanco {
  usar: (ideaId: string) => Promise<Resultado>
  quitar: (ideaId: string) => Promise<Resultado>
  proponer: (gancho: string, tema: string) => Promise<Resultado<{ propuesta: PropuestaDeIdea }>>
  crear: (idea: IdeaConfirmada) => Promise<Resultado<{ id: string }>>
}

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
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  const libres = ideas.filter((idea) => idea.estado === "idea" && !sumadas.includes(idea.id))
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
  return (
    <div className="grid gap-4.5">
      <header className="grid gap-1.5">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-label font-semibold text-acento"
        >
          <ChevronLeft aria-hidden="true" size={20} />
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
                <Search aria-hidden="true" size={18} />
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
          <p className="text-meta text-apagado" aria-live="polite">
            Idea {posicion} de {libres.length}
          </p>
          <CartaDeIdea key={actual.id} idea={actual} />
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
      <Plus aria-hidden="true" size={18} />
      Escribir una idea mía
    </Boton>
  )
}
