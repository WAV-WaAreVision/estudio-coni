"use client"

import { ArrowRight } from "@phosphor-icons/react"
import Link from "next/link"
import { useCallback, useState, useTransition } from "react"
import { Seccion } from "@/components/seccion"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { Casilla } from "@/components/ui/casilla"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { FilaNavegacion } from "@/components/ui/filas"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { Resultado } from "@/lib/acciones/resultado"
import { MAXIMO_DE_IDEAS } from "@/lib/dominio/ideas"
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"

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
  // Stable, so a re-render while the toast is up does not restart its 8 s.
  const cerrarAviso = useCallback(() => setAviso(null), [])
  const [pendiente, empezar] = useTransition()

  if (ideas.length === 0) {
    return (
      <Seccion titulo="Ideas de la semana" id="ideas-titulo">
        <p className="text-cuerpo text-apagado">Usaste todas las ideas del banco. Escribe una idea nueva.</p>
        <Link href="/ideas" className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "w-fit" })}>
          Escribir una idea
        </Link>
      </Seccion>
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
    <Seccion titulo="Ideas de la semana" id="ideas-titulo" cifra={`${cuantas} de ${MAXIMO_DE_IDEAS}`}>
      <ul>
        {ideas.map((idea) => {
          const marcada = elegidas.includes(idea.id)
          return (
            <li key={idea.id} data-pilar={idea.pilar} className="list-none">
              <Casilla
                etiqueta={idea.gancho}
                detalle={NOMBRE_DE_PILAR[idea.pilar]}
                marcada={marcada}
                deshabilitada={(!marcada && enElMaximo) || pendiente}
                alCambiar={(valor) => alternar(idea.id, valor)}
              />
            </li>
          )
        })}
      </ul>
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      <Boton
        deshabilitado={!lista}
        cargando={pendiente}
        icono={<ArrowRight aria-hidden="true" size={20} />}
        onClick={escribir}
      >
        {lista ? `Escribir ${cuantas} ${cuantas === 1 ? "guion" : "guiones"}` : "Escribir guiones"}
      </Boton>
      <p className="text-meta text-apagado">
        {enElMaximo
          ? `Llegaste al máximo de ${MAXIMO_DE_IDEAS}.`
          : lista
            ? `Puedes sumar hasta ${MAXIMO_DE_IDEAS - cuantas} más.`
            : `Elige al menos una idea. Puedes elegir hasta ${MAXIMO_DE_IDEAS}.`}
      </p>
      <FilaNavegacion href="/ideas">Ver todas las ideas</FilaNavegacion>
      {aviso ? <Aviso mensaje={aviso} alCerrar={cerrarAviso} /> : null}
    </Seccion>
  )
}
