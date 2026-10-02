"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { PildoraPilar } from "@/components/ui/pildora-pilar"
import type { Resultado } from "@/lib/acciones/resultado"
import { MAXIMO_DE_IDEAS } from "@/lib/dominio/ideas"
import type { Pilar } from "@/lib/dominio/pilares"

export interface IdeaParaElegir {
  id: string
  gancho: string
  pilar: Pilar
}

interface PropiedadesDeIdeas {
  ideas: readonly IdeaParaElegir[]
  alElegir: (ideaIds: string[]) => Promise<Resultado<{ piezas: string[] }>>
}

export function IdeasSemana({ ideas, alElegir }: PropiedadesDeIdeas) {
  const [elegidas, setElegidas] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  if (ideas.length === 0) {
    return (
      <div className="grid gap-1.5">
        <p className="text-apagado">Usaste todas las ideas del banco. Escribe una idea nueva.</p>
        <Link href="/ideas" className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "w-fit" })}>
          Escribir una idea
        </Link>
      </div>
    )
  }

  const cuantas = elegidas.length
  const lista = cuantas >= 1
  const enElMaximo = cuantas >= MAXIMO_DE_IDEAS

  function alternar(id: string, marcada: boolean) {
    setError(null)
    setElegidas((actuales) => (marcada ? [...actuales, id] : actuales.filter((actual) => actual !== id)))
  }

  function escribir() {
    setError(null)
    empezar(async () => {
      const resultado = await alElegir(elegidas)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setElegidas([])
      setAviso(`Escribiendo ${resultado.piezas.length} guiones. Te aviso cuando estén.`)
    })
  }

  return (
    <div className="grid gap-3.5 rounded-lg border border-linea bg-superficie p-4">
      <ul className="grid gap-1">
        {ideas.map((idea) => {
          const marcada = elegidas.includes(idea.id)
          const bloqueada = !marcada && enElMaximo
          return (
            <li key={idea.id}>
              <label
                data-pilar={idea.pilar}
                className="grid min-h-11 cursor-pointer grid-cols-[26px_1fr] items-start gap-3 py-2 has-[:disabled]:cursor-default has-[:disabled]:opacity-60"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-6 accent-acento"
                  checked={marcada}
                  disabled={bloqueada || pendiente}
                  onChange={(evento) => alternar(idea.id, evento.target.checked)}
                />
                <span className="grid justify-items-start gap-1.5">
                  <span>{idea.gancho}</span>
                  <PildoraPilar pilar={idea.pilar} />
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
          {error}
        </p>
      ) : null}
      <Boton deshabilitado={!lista} cargando={pendiente} onClick={escribir}>
        {lista ? `Escribir ${cuantas} ${cuantas === 1 ? "guion" : "guiones"}` : "Escribir guiones"}
      </Boton>
      <p className="text-center text-meta text-apagado">
        {enElMaximo
          ? `Llegaste al máximo de ${MAXIMO_DE_IDEAS}.`
          : lista
            ? `Puedes sumar hasta ${MAXIMO_DE_IDEAS - cuantas} más.`
            : `Elige al menos una idea. Puedes elegir hasta ${MAXIMO_DE_IDEAS}.`}
      </p>
      {aviso ? <Aviso mensaje={aviso} alCerrar={() => setAviso(null)} /> : null}
    </div>
  )
}
