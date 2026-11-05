import { z } from "zod"
import { hrefDeAutor } from "./autores"
import type { TemaResumido } from "./temas"

export const RUTA_DE_TEMAS = "/biblioteca/temas"
export const hrefDeTema = (id: string) => `${RUTA_DE_TEMAS}/${id}`

/** Coni's option 1: by coverage. "Sin tratar" and "Ya los traté" split on `tratado`. */
export const COBERTURAS = ["sin-tratar", "tratados", "un-autor"] as const
export type Cobertura = (typeof COBERTURAS)[number]

export interface FiltrosDeTemas {
  cobertura?: Cobertura
  pilar?: string
}

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

/**
 * The filters of Temas from the URL; an unknown value is ignored, never an error. A pillar that is not among
 * `pilaresActivos` is dropped too, so the list never filters by one the select cannot show; the client, which has no
 * list, passes none and leaves that check to the page.
 */
export function leerFiltrosDeTemas(params: Params, pilaresActivos?: readonly string[]): FiltrosDeTemas {
  const filtros: FiltrosDeTemas = {}
  const cobertura = z.enum(COBERTURAS).safeParse(primero(params.cobertura)?.trim())
  if (cobertura.success) filtros.cobertura = cobertura.data
  const pilar = z.uuid().safeParse(primero(params.pilar)?.trim())
  if (pilar.success && (pilaresActivos === undefined || pilaresActivos.includes(pilar.data))) {
    filtros.pilar = pilar.data
  }
  return filtros
}

export function hayFiltrosDeTemas(filtros: FiltrosDeTemas): boolean {
  return Boolean(filtros.cobertura || filtros.pilar)
}

const CUMPLE: Record<Cobertura, (tema: TemaResumido) => boolean> = {
  "sin-tratar": (tema) => !tema.tratado,
  tratados: (tema) => tema.tratado,
  "un-autor": (tema) => tema.autores === 1,
}

export function filtrarPorCobertura(temas: readonly TemaResumido[], cobertura?: Cobertura): TemaResumido[] {
  return cobertura ? temas.filter(CUMPLE[cobertura]) : [...temas]
}

/** The quick filters' counts, over the topics of the chosen pillar. */
export function contarCoberturas(temas: readonly TemaResumido[]): Record<Cobertura, number> {
  return {
    "sin-tratar": temas.filter(CUMPLE["sin-tratar"]).length,
    tratados: temas.filter(CUMPLE.tratados).length,
    "un-autor": temas.filter(CUMPLE["un-autor"]).length,
  }
}

const ORDEN = ["pilar", "cobertura"] as const

/** Temas with these filters (and the side panel open on `seleccion`): linkable, Back undoes it. */
export function hrefDeTemas(filtros: FiltrosDeTemas, seleccion: string | null = null): string {
  const params = new URLSearchParams()
  for (const clave of ORDEN) {
    const valor = filtros[clave]
    if (valor) params.set(clave, valor)
  }
  if (seleccion) params.set("t", seleccion)
  const consulta = params.toString()
  return consulta ? `${RUTA_DE_TEMAS}?${consulta}` : RUTA_DE_TEMAS
}

export const AVISO_TRAS_OCULTAR = "La oculté. La puedes volver a mostrar desde su autor."
export const AVISO_TRAS_OCULTAR_LA_ULTIMA =
  "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor."

/**
 * Where Ocultar goes (D6). The hidden idea leaves its topic, and a topic left without ideas is deleted by the database
 * (`recalcular_tema`), so the last one goes to the list. The count is the topic's ideas before hiding; the idea's id
 * makes each address new.
 */
export function hrefTrasOcultar(temaId: string, ideaId: string, ideasAntesDeOcultar: number): string {
  return ideasAntesDeOcultar > 1 ? `${hrefDeTema(temaId)}?oculta=${ideaId}` : `${RUTA_DE_TEMAS}?oculta=${ideaId}`
}

// A path inside the Biblioteca and a plain query: no scheme, host, dot, backslash, percent or doubled slash passes.
const DESTINO_DE_LA_BIBLIOTECA = /^\/biblioteca(?:\/[A-Za-z0-9_-]+)+(?:\?[A-Za-z0-9_=&-]*)?$/

/**
 * Where the server goes after Ocultar or Mostrar. The address comes from the client, so only one of the Biblioteca's
 * own is kept; anything else lands on the Temas list, never on another site.
 */
export function destinoTrasOcultar(destino: unknown): string {
  return typeof destino === "string" && DESTINO_DE_LA_BIBLIOTECA.test(destino) ? destino : RUTA_DE_TEMAS
}

/** The idea just hidden (`?oculta=<id>`), so the page says its note; anything else is no note. */
export function leerIdeaOculta(params: Params): string | null {
  const leida = z.uuid().safeParse(primero(params.oculta)?.trim())
  return leida.success ? leida.data : null
}

export const AVISO_TRAS_MOSTRAR = "La volví a mostrar. Está en «Sin tema todavía»."

/**
 * Where Mostrar goes: back to the author, with the idea in the address so the page says its note. Shown again, the idea
 * has no topic until the next maintenance run places it (deviation 2).
 */
export const hrefTrasMostrar = (autorId: string, ideaId: string) => `${hrefDeAutor(autorId)}?mostrada=${ideaId}`

/** The idea just shown again (`?mostrada=<id>`); anything else is no note. */
export function leerIdeaMostrada(params: Params): string | null {
  const leida = z.uuid().safeParse(primero(params.mostrada)?.trim())
  return leida.success ? leida.data : null
}
