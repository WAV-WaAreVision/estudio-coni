"use client"

import { Check, Warning } from "@phosphor-icons/react"
import { useState } from "react"
import { Chip } from "@/components/chip"
import { Boton } from "@/components/ui/boton"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import type { PilarVisible } from "@/lib/dominio/pilares"
import { etiquetaDeAlerta } from "@/lib/dominio/revision"
import { buscarIdeas, type IdeaDeBanco } from "@/lib/ideas/mazo"

const RESULTADOS_A_MOSTRAR = 40

interface PropiedadesDeBusqueda {
  ideas: readonly IdeaDeBanco[]
  /** The active pillars, in order: one chip each. */
  pilares: readonly PilarVisible[]
  /** Ideas she just added to the week from this screen: they are not offered again. */
  sumadas: readonly string[]
  alAbrir: (ideaId: string) => void
  alEscribirPropia: () => void
}

export function BusquedaDeIdeas({ ideas, pilares, sumadas, alAbrir, alEscribirPropia }: PropiedadesDeBusqueda) {
  const [texto, setTexto] = useState("")
  const [pilar, setPilar] = useState<string | null>(null)
  const [soloFuerzaAlta, setSoloFuerzaAlta] = useState(false)
  const [soloSinAlertas, setSoloSinAlertas] = useState(false)
  const [soloSinUsar, setSoloSinUsar] = useState(true)

  const resultados = buscarIdeas(ideas, { texto, pilar, soloFuerzaAlta, soloSinAlertas, soloSinUsar })
  const visibles = resultados.slice(0, RESULTADOS_A_MOSTRAR)

  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-meta font-semibold" htmlFor="buscar-idea">
        Buscar por palabra o tema
        <input
          id="buscar-idea"
          type="search"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="culpa, celos, deseo"
          autoComplete="off"
          className="campo text-cuerpo font-normal text-tinta [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>

      <fieldset className="flex min-w-0 gap-2 overflow-x-auto">
        <legend className="sr-only">Pilar</legend>
        <Chip presionado={pilar === null} onClick={() => setPilar(null)}>
          Todos
        </Chip>
        {pilares.map((candidato) => (
          <Chip
            key={candidato.slug}
            presionado={pilar === candidato.slug}
            onClick={() => setPilar(pilar === candidato.slug ? null : candidato.slug)}
          >
            {candidato.nombreCorto}
          </Chip>
        ))}
      </fieldset>
      <fieldset className="flex min-w-0 gap-2 overflow-x-auto">
        <legend className="sr-only">Filtros</legend>
        <Chip presionado={soloFuerzaAlta} onClick={() => setSoloFuerzaAlta(!soloFuerzaAlta)}>
          Fuerza alta
        </Chip>
        <Chip presionado={soloSinAlertas} onClick={() => setSoloSinAlertas(!soloSinAlertas)}>
          Sin alertas
        </Chip>
        <Chip presionado={soloSinUsar} onClick={() => setSoloSinUsar(!soloSinUsar)}>
          Sin usar
        </Chip>
      </fieldset>

      <p className="text-meta text-apagado" aria-live="polite">
        {resultados.length === 1 ? "1 resultado" : `${resultados.length} resultados`}
      </p>

      {resultados.length === 0 ? (
        <div className="grid gap-2.5 py-1">
          <p className="text-cuerpo font-semibold">No encontré ideas con esa palabra.</p>
          <Boton variante="secundario" onClick={alEscribirPropia}>
            Escribir una idea mía
          </Boton>
        </div>
      ) : (
        <Grupo lista>
          {visibles.map((idea) => (
            <li key={idea.id}>
              <FilaDeResultado idea={idea} sumada={sumadas.includes(idea.id)} alAbrir={alAbrir} />
            </li>
          ))}
        </Grupo>
      )}
      {resultados.length > visibles.length ? (
        <p className="text-meta text-apagado">
          Muestro {visibles.length} de {resultados.length}. Escribe una palabra para acotar.
        </p>
      ) : null}
    </div>
  )
}

function FilaDeResultado({
  idea,
  sumada,
  alAbrir,
}: {
  idea: IdeaDeBanco
  sumada: boolean
  alAbrir: (ideaId: string) => void
}) {
  const abierta = idea.estado === "idea" && !sumada
  const contenido = (
    <>
      <span className="text-meta text-apagado">{idea.nombreCortoPilar}</span>
      <span className="text-cuerpo leading-[1.3] font-semibold">{idea.gancho}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-apagado">
        <span>Fuerza {idea.fuerza}</span>
        {idea.estado === "usada" ? (
          <span className="inline-flex items-center gap-1 font-semibold text-tinta">
            <Check aria-hidden="true" size={ICONO.chico} />
            Usada
          </span>
        ) : null}
        {sumada ? (
          <span className="inline-flex items-center gap-1 font-semibold text-tinta">
            <Check aria-hidden="true" size={ICONO.chico} />
            En la semana
          </span>
        ) : null}
        {idea.alertas.map((alerta) => (
          <span key={alerta.tipo} className="inline-flex items-center gap-1 font-semibold text-tinta">
            <Warning aria-hidden="true" size={ICONO.chico} />
            {etiquetaDeAlerta(alerta.tipo)}
          </span>
        ))}
      </span>
    </>
  )
  return abierta ? (
    <button
      type="button"
      onClick={() => alAbrir(idea.id)}
      className="grid min-h-fila w-full gap-0.5 py-3 text-left transition-colors duration-[var(--dur-corta)] active:bg-piedra-honda"
    >
      {contenido}
    </button>
  ) : (
    <div className="grid min-h-fila gap-0.5 py-3">{contenido}</div>
  )
}
