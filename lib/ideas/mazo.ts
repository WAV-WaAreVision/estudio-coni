import type { Alerta } from "@/lib/dominio/revision"

/** An idea of the bank as the Banco screen needs it. */
export interface IdeaDeBanco {
  id: string
  numero: number | null
  pilar: string
  /** The pillar's name from the catalog: the search finds an idea by it. */
  nombrePilar: string
  gancho: string
  tema: string
  formato: string
  fuerza: "alta" | "media" | "baja"
  alertas: Alerta[]
  estado: "idea" | "usada" | "descartada"
  /** She added it to the week's ideas: Inicio offers it first. */
  fijada: boolean
  /** The engine wrote it in the latest ready run: it goes first, under "Nuevas de la semana". */
  nueva: boolean
  /** Why the engine proposes it; null for an idea that did not come from the engine. */
  porQue: PorQueDeIdea | null
}

export type NivelDeEvidencia = "alto" | "medio" | "debil"

/** The theory behind an engine idea and its backing. The backing is for her only: it is never published. */
export interface PorQueDeIdea {
  titulo: string
  tesis: string
  nivel: NivelDeEvidencia | null
  respaldo: { autor: string; cita: string }[]
}

export interface FiltroDeIdeas {
  texto: string
  pilar: string | null
  soloFuerzaAlta: boolean
  soloSinAlertas: boolean
  soloSinUsar: boolean
}

/** Lower case and without accents, so "por que" finds "¿Por qué...?". */
function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function coincide(idea: IdeaDeBanco, texto: string): boolean {
  const numero = /^#\s*(\d+)$/.exec(texto)
  if (numero) return idea.numero === Number(numero[1])
  const paja = plano([idea.gancho, idea.tema, idea.formato, idea.nombrePilar].join(" "))
  return texto.split(/\s+/).every((palabra) => paja.includes(palabra))
}

/** The ideas that pass every filter, in the order they came. Words are all required, in any order. */
export function buscarIdeas(ideas: readonly IdeaDeBanco[], filtro: FiltroDeIdeas): IdeaDeBanco[] {
  const texto = plano(filtro.texto).trim()
  return ideas.filter(
    (idea) =>
      (texto === "" || coincide(idea, texto)) &&
      (filtro.pilar === null || idea.pilar === filtro.pilar) &&
      (!filtro.soloFuerzaAlta || idea.fuerza === "alta") &&
      (!filtro.soloSinAlertas || idea.alertas.length === 0) &&
      (!filtro.soloSinUsar || idea.estado === "idea"),
  )
}
