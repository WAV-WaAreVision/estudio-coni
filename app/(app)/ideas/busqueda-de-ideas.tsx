"use client"

import { useState } from "react"
import { Chip } from "@/components/chip"
import { ChipDeAlerta } from "@/components/chip-de-alerta"
import { Boton } from "@/components/ui/boton"
import { PildoraPilar } from "@/components/ui/pildora-pilar"
import { NOMBRE_CORTO_DE_PILAR, PILARES, type Pilar } from "@/lib/dominio/pilares"
import { buscarIdeas, type IdeaDeBanco } from "@/lib/ideas/mazo"

const RESULTADOS_A_MOSTRAR = 40

interface PropiedadesDeBusqueda {
  ideas: readonly IdeaDeBanco[]
  /** Ideas she just added to the week from this screen: they are not offered again. */
  sumadas: readonly string[]
  alAbrir: (ideaId: string) => void
  alEscribirPropia: () => void
}

export function BusquedaDeIdeas({ ideas, sumadas, alAbrir, alEscribirPropia }: PropiedadesDeBusqueda) {
  const [texto, setTexto] = useState("")
  const [pilar, setPilar] = useState<Pilar | null>(null)
  const [soloFuerzaAlta, setSoloFuerzaAlta] = useState(false)
  const [soloSinAlertas, setSoloSinAlertas] = useState(false)
  const [soloSinUsar, setSoloSinUsar] = useState(true)

  const resultados = buscarIdeas(ideas, { texto, pilar, soloFuerzaAlta, soloSinAlertas, soloSinUsar })
  const visibles = resultados.slice(0, RESULTADOS_A_MOSTRAR)

  return (
    <div className="grid gap-3.5">
      <label className="grid gap-1.5 text-label font-semibold" htmlFor="buscar-idea">
        Buscar por palabra o tema
        <input
          id="buscar-idea"
          type="search"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="culpa, celos, deseo"
          autoComplete="off"
          className="min-h-13 rounded-md border border-linea bg-superficie px-3.5 text-body font-normal text-tinta placeholder:text-apagado [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>

      <fieldset className="flex min-w-0 flex-wrap gap-1.5">
        <legend className="sr-only">Pilar</legend>
        <Chip presionado={pilar === null} onClick={() => setPilar(null)}>
          Todos
        </Chip>
        {PILARES.map((candidato) => (
          <Chip
            key={candidato}
            presionado={pilar === candidato}
            onClick={() => setPilar(pilar === candidato ? null : candidato)}
          >
            {NOMBRE_CORTO_DE_PILAR[candidato]}
          </Chip>
        ))}
      </fieldset>
      <fieldset className="flex min-w-0 flex-wrap gap-1.5">
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
          <p className="font-semibold">No encontré ideas con esa palabra.</p>
          <Boton variante="linea" onClick={alEscribirPropia}>
            Escribir una idea mía
          </Boton>
        </div>
      ) : (
        <ul>
          {visibles.map((idea) => (
            <li key={idea.id} className="border-b border-linea last:border-b-0">
              <FilaDeResultado idea={idea} sumada={sumadas.includes(idea.id)} alAbrir={alAbrir} />
            </li>
          ))}
        </ul>
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
      <span className="font-semibold">{idea.gancho}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-meta text-apagado">
        <PildoraPilar pilar={idea.pilar} />
        {idea.estado === "usada" ? (
          <span className="rounded-full bg-ok-fondo px-2.5 py-1 font-semibold text-ok-tinta">Usada</span>
        ) : null}
        {sumada ? (
          <span className="rounded-full bg-ok-fondo px-2.5 py-1 font-semibold text-ok-tinta">En la semana</span>
        ) : null}
        <span>Fuerza {idea.fuerza}</span>
        {idea.alertas.map((alerta) => (
          <ChipDeAlerta key={alerta.tipo} tipo={alerta.tipo} />
        ))}
      </span>
    </>
  )
  return abierta ? (
    <button
      type="button"
      onClick={() => alAbrir(idea.id)}
      className="grid min-h-16 w-full gap-1.5 py-3 text-left transition-opacity duration-150 active:opacity-70"
    >
      {contenido}
    </button>
  ) : (
    <div className="grid min-h-16 gap-1.5 py-3 opacity-90">{contenido}</div>
  )
}
