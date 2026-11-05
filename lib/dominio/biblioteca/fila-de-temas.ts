import { z } from "zod"
import { esRed, type PilarDeRed, type Red } from "@/lib/dominio/pilares"
import { RUTA_DE_TEMAS } from "./filtros-de-temas"
import type { TemaResumido } from "./temas"

/** Without `?red` and with nothing stored, Temas opens on LinkedIn (spec 2026-11-04, part 15b, section 2). */
export const RED_POR_DEFECTO: Red = "linkedin"

/**
 * Coni's row (spec 15b): always a network, maybe a pillar or layer of it, and three switches. Every value lives in the
 * address. A switch is present only when on, so two equal choices are equal objects.
 */
export interface FiltrosDeTemas {
  red: Red
  /** A pillar or layer of `red`. */
  pilar?: string
  /** Nothing out on `red` yet. Excludes `tratados`. */
  sinTratar?: true
  /** At least one piece out on `red` («Ya los traté»). Excludes `sinTratar`. */
  tratados?: true
  /** Backed by one author («Un solo autor»); combines with everything. */
  unAutor?: true
}

export interface ContextoDeTemas {
  /** Every network's pillars and layers, as `listarPilaresDeTemas` gives them. */
  pilares: readonly PilarDeRed[]
  /** `ajustes.ultima_red`. */
  ultimaRed: Red | null
}

/** How many topics of the network and pillar each switch would leave. */
export interface ConteosDeTemas {
  sinTratar: number
  tratados: number
  unAutor: number
}

type Params = Record<string, string | string[] | undefined>

interface Interruptores {
  sinTratar: boolean
  tratados: boolean
  unAutor: boolean
}

const ENCENDIDO = "1"

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)?.trim()

function armar(red: Red, pilar: string | undefined, { sinTratar, tratados, unAutor }: Interruptores): FiltrosDeTemas {
  const filtros: FiltrosDeTemas = { red }
  if (pilar) filtros.pilar = pilar
  if (sinTratar) filtros.sinTratar = true
  if (tratados) filtros.tratados = true
  if (unAutor) filtros.unAutor = true
  return filtros
}

const interruptores = (filtros: FiltrosDeTemas): Interruptores => ({
  sinTratar: filtros.sinTratar === true,
  tratados: filtros.tratados === true,
  unAutor: filtros.unAutor === true,
})

/** The row from the address; an invalid value reads as absent, never as an error. */
export function leerFiltrosDeTemas(params: Params, { pilares, ultimaRed }: ContextoDeTemas): FiltrosDeTemas {
  const pedida = primero(params.red)
  const id = z.uuid().safeParse(primero(params.pilar))
  const pilar = id.success ? pilares.find((candidato) => candidato.id === id.data) : undefined
  // 15a's addresses carried `?pilar=` alone: the pillar says its network.
  const red = esRed(pedida) ? pedida : (pilar?.red ?? ultimaRed ?? RED_POR_DEFECTO)
  // Batch 3's addresses (`?cobertura=`) read as the switch they named.
  const cobertura = primero(params.cobertura)
  const encendido = (clave: "sin-tratar" | "tratados" | "un-autor") =>
    primero(params[clave]) === ENCENDIDO || cobertura === clave
  const sinTratar = encendido("sin-tratar")
  const tratados = encendido("tratados")
  // The two exclude each other: an address with both is contradictory and reads as neither.
  return armar(red, pilar?.red === red ? pilar.id : undefined, {
    sinTratar: sinTratar && !tratados,
    tratados: tratados && !sinTratar,
    unAutor: encendido("un-autor"),
  })
}

/** A network alone is where she is, not a filter: the empty list says so only when something narrows it. */
export function hayFiltrosDeTemas(filtros: FiltrosDeTemas): boolean {
  return Boolean(filtros.pilar || filtros.sinTratar || filtros.tratados || filtros.unAutor)
}

/** Temas with these filters (and the side panel open on `seleccion`): linkable, Back undoes it. */
export function hrefDeTemas(filtros: FiltrosDeTemas, seleccion: string | null = null): string {
  const params = new URLSearchParams({ red: filtros.red })
  if (filtros.pilar) params.set("pilar", filtros.pilar)
  if (filtros.sinTratar) params.set("sin-tratar", ENCENDIDO)
  if (filtros.tratados) params.set("tratados", ENCENDIDO)
  if (filtros.unAutor) params.set("un-autor", ENCENDIDO)
  if (seleccion) params.set("t", seleccion)
  return `${RUTA_DE_TEMAS}?${params}`
}

export function alternarSinTratar(filtros: FiltrosDeTemas): FiltrosDeTemas {
  return armar(filtros.red, filtros.pilar, {
    ...interruptores(filtros),
    sinTratar: !filtros.sinTratar,
    tratados: false,
  })
}

export function alternarTratados(filtros: FiltrosDeTemas): FiltrosDeTemas {
  return armar(filtros.red, filtros.pilar, {
    ...interruptores(filtros),
    tratados: !filtros.tratados,
    sinTratar: false,
  })
}

export function alternarUnAutor(filtros: FiltrosDeTemas): FiltrosDeTemas {
  return armar(filtros.red, filtros.pilar, { ...interruptores(filtros), unAutor: !filtros.unAutor })
}

/** Another network closes this one's pillars; the chosen one again goes back to «Todos los pilares». */
export function conRed(filtros: FiltrosDeTemas, red: Red): FiltrosDeTemas {
  return armar(red, undefined, interruptores(filtros))
}

/** A pillar or layer of the chosen network; undefined is «Todos los pilares». */
export function conPilar(filtros: FiltrosDeTemas, pilar: string | undefined): FiltrosDeTemas {
  return armar(filtros.red, pilar, interruptores(filtros))
}

/** The switches over the topics already read for the network and pillar. */
export function filtrarTemas(temas: readonly TemaResumido[], filtros: FiltrosDeTemas): TemaResumido[] {
  return temas.filter(
    (tema) =>
      (!filtros.sinTratar || !tema.tratado) &&
      (!filtros.tratados || tema.tratado) &&
      (!filtros.unAutor || tema.autores === 1),
  )
}

export function contarFiltros(temas: readonly TemaResumido[]): ConteosDeTemas {
  return {
    sinTratar: temas.filter((tema) => !tema.tratado).length,
    tratados: temas.filter((tema) => tema.tratado).length,
    unAutor: temas.filter((tema) => tema.autores === 1).length,
  }
}
