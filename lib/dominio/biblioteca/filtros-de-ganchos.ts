import { z } from "zod"
import { esRed, type PilarDeRed, type Red } from "@/lib/dominio/pilares"
import { type GanchoDeLista, SIN_CLASIFICAR, type TipoDeGancho } from "./ganchos"

export const RUTA_DE_GANCHOS = "/biblioteca/ganchos"
export const hrefDeGancho = (id: string) => `${RUTA_DE_GANCHOS}/${id}`

export const SIN_RED = "sin_red"
export type RedDeFiltro = Red | typeof SIN_RED

/**
 * Coni's filters of the hooks (spec 6b). Every value lives in the address. A switch is present only when on, so two
 * equal choices are equal objects. `pilar` exists only with `red` set to a network.
 */
export interface FiltrosDeGanchos {
  tipo?: string
  red?: RedDeFiltro
  pilar?: string
  tema?: string
  autor?: string
  favoritos?: true
  misTipos?: true
}

export interface ContextoDeGanchos {
  tipos: readonly TipoDeGancho[]
  pilares: readonly PilarDeRed[]
  /** Her preferred types still active in the list (`tiposPreferidosActivos`). */
  misTipos: readonly string[]
}

type Params = Record<string, string | string[] | undefined>

const ENCENDIDO = "1"
const VALOR_DE_LISTA = /^[a-z_]{1,60}$/

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)?.trim()

function uuid(valor: string | string[] | undefined): string | undefined {
  const leido = z.uuid().safeParse(primero(valor))
  return leido.success ? leido.data : undefined
}

/** The address read on its own, without the lists: what the filter form sends. Invalid values read as absent. */
export function filtrosDeParametros(params: Params): FiltrosDeGanchos {
  const filtros: FiltrosDeGanchos = {}
  const tipo = primero(params.tipo)
  if (tipo && VALOR_DE_LISTA.test(tipo)) filtros.tipo = tipo
  const red = primero(params.red)
  if (esRed(red) || red === SIN_RED) filtros.red = red
  const pilar = uuid(params.pilar)
  if (pilar && esRed(filtros.red)) filtros.pilar = pilar
  const tema = uuid(params.tema)
  if (tema) filtros.tema = tema
  const autor = uuid(params.autor)
  if (autor) filtros.autor = autor
  if (primero(params.favoritos) === ENCENDIDO) filtros.favoritos = true
  if (primero(params["mis-tipos"]) === ENCENDIDO) filtros.misTipos = true
  return filtros
}

/** Against the lists: an active type or «Sin clasificar», a pillar of the chosen network, «Mis tipos» only if any. */
export function validarFiltros(filtros: FiltrosDeGanchos, contexto: ContextoDeGanchos): FiltrosDeGanchos {
  const { tipo, pilar, misTipos, ...resto } = filtros
  const validos: FiltrosDeGanchos = { ...resto }
  if (tipo && (tipo === SIN_CLASIFICAR || contexto.tipos.some((t) => t.valor === tipo && t.activo))) validos.tipo = tipo
  if (pilar && contexto.pilares.some((p) => p.id === pilar && p.red === filtros.red && !p.esCapa)) validos.pilar = pilar
  if (misTipos && contexto.misTipos.length > 0) validos.misTipos = true
  return validos
}

export function leerFiltrosDeGanchos(params: Params, contexto: ContextoDeGanchos): FiltrosDeGanchos {
  return validarFiltros(filtrosDeParametros(params), contexto)
}

const ORDEN = ["tipo", "red", "pilar", "tema", "autor"] as const

/** The list's address with these filters (and the side panel open on `seleccion`): linkable, Back undoes it. */
export function hrefDeGanchos(filtros: FiltrosDeGanchos, seleccion: string | null = null): string {
  const params = new URLSearchParams()
  for (const clave of ORDEN) {
    const valor = filtros[clave]
    if (valor) params.set(clave, valor)
  }
  if (filtros.favoritos) params.set("favoritos", ENCENDIDO)
  if (filtros.misTipos) params.set("mis-tipos", ENCENDIDO)
  if (seleccion) params.set("g", seleccion)
  const consulta = params.toString()
  return consulta ? `${RUTA_DE_GANCHOS}?${consulta}` : RUTA_DE_GANCHOS
}

/** The cascade: a pillar belongs to one network, so changing or clearing the network clears it. */
export function conRed(filtros: FiltrosDeGanchos, red: RedDeFiltro | undefined): FiltrosDeGanchos {
  const { red: _red, pilar: _pilar, ...resto } = filtros
  return red ? { ...resto, red } : resto
}

export function conPilar(filtros: FiltrosDeGanchos, pilar: string | undefined): FiltrosDeGanchos {
  const { pilar: _pilar, ...resto } = filtros
  return pilar ? { ...resto, pilar } : resto
}

export function alternarFavoritos(filtros: FiltrosDeGanchos): FiltrosDeGanchos {
  const { favoritos, ...resto } = filtros
  return favoritos ? resto : { ...resto, favoritos: true }
}

export function alternarMisTipos(filtros: FiltrosDeGanchos): FiltrosDeGanchos {
  const { misTipos, ...resto } = filtros
  return misTipos ? resto : { ...resto, misTipos: true }
}

/** Type, topic and author live folded under «Más filtros». */
export function filtrosPlegados(filtros: FiltrosDeGanchos): number {
  return [filtros.tipo, filtros.tema, filtros.autor].filter(Boolean).length
}

export function sinPlegados(filtros: FiltrosDeGanchos): FiltrosDeGanchos {
  const { tipo: _tipo, tema: _tema, autor: _autor, ...resto } = filtros
  return resto
}

export function hayFiltrosDeGanchos(filtros: FiltrosDeGanchos): boolean {
  return Object.keys(filtros).length > 0
}

/** The hooks that pass every filter; `misTipos` are her active preferred types. */
export function filtrarGanchos<T extends GanchoDeLista>(
  ganchos: readonly T[],
  filtros: FiltrosDeGanchos,
  misTipos: readonly string[],
): T[] {
  return ganchos.filter(
    (gancho) =>
      (!filtros.tipo || gancho.tipo === filtros.tipo) &&
      (!filtros.red ||
        (filtros.red === SIN_RED
          ? gancho.pilares.length === 0
          : gancho.pilares.some((pilar) => pilar.red === filtros.red))) &&
      (!filtros.pilar || gancho.pilares.some((pilar) => pilar.pilarId === filtros.pilar)) &&
      (!filtros.tema || gancho.tema?.id === filtros.tema) &&
      (!filtros.autor || gancho.autor?.id === filtros.autor) &&
      (!filtros.favoritos || gancho.favorito) &&
      (!filtros.misTipos || misTipos.includes(gancho.tipo)),
  )
}
