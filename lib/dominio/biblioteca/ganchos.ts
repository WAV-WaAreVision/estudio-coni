import type { Red } from "@/lib/dominio/pilares"
import type { Certeza, ValorGuardado, Vocabulario } from "@/lib/dominio/vocabulario"
import type { Ubicacion } from "./ficha"

/** The two values a hook's type can take outside the list: an old free-text hook, and «no type fits». */
export const SIN_CLASIFICAR = "sin_clasificar"
export const NINGUNO = "ninguno"
export const ETIQUETA_SIN_CLASIFICAR = "Sin clasificar"
const ETIQUETA_NINGUNO = "Ninguno de la lista"
const ETIQUETA_FUERA_DE_LA_LISTA = "Un tipo que ya no está en la lista"

export const AVISO_SIN_CLASIFICAR = "Sin clasificar: el tipo y la frase sin gancho llegan al reprocesar la Biblioteca."
export const SIN_GANCHOS = "Los ganchos aparecen al procesar materiales."
export const SIN_COINCIDENCIAS = "Ningún gancho coincide con esos filtros."

export interface PilarDeGancho {
  red: Red
  pilarId: string
  nombre: string
}

/** A row of `biblioteca_de_ganchos` as the screens use it. */
export interface GanchoDeLista {
  afirmacionId: string
  fraseExacta: string
  /** Null for an old hook: it arrives with change 7's reprocess. */
  fraseSinGancho: string | null
  /** A list value, `ninguno`, or `sin_clasificar` for an old hook. */
  tipo: string
  certeza: Certeza | null
  clasificado: boolean
  creadoEn: string
  material: { id: string; titulo: string | null }
  ubicacion: Ubicacion | null
  autor: { id: string; nombre: string } | null
  tema: { id: string; nombre: string } | null
  /** Per network, from the topic's pillars (layers excluded); empty is «Sin red». */
  pilares: PilarDeGancho[]
  favorito: boolean
}

/** A value of the vigente `gancho` list; a retired one stays for the hooks and choices that carry it. */
export interface TipoDeGancho {
  valor: string
  etiqueta: string
  activo: boolean
}

export interface Opcion {
  id: string
  nombre: string
}

export function tiposDeGancho(valores: readonly ValorGuardado[]): TipoDeGancho[] {
  return valores.map((valor) => ({ valor: valor.valor, etiqueta: valor.etiqueta, activo: !valor.retirado }))
}

export function etiquetaDeTipo(tipos: readonly TipoDeGancho[], valor: string): string {
  if (valor === SIN_CLASIFICAR) return ETIQUETA_SIN_CLASIFICAR
  if (valor === NINGUNO) return ETIQUETA_NINGUNO
  return tipos.find((tipo) => tipo.valor === valor)?.etiqueta ?? ETIQUETA_FUERA_DE_LA_LISTA
}

/** Her chosen types that still filter: a type retired from the list stays stored and is ignored. */
export function tiposPreferidosActivos(preferidos: readonly string[], tipos: readonly TipoDeGancho[]): string[] {
  return preferidos.filter((valor) => tipos.some((tipo) => tipo.valor === valor && tipo.activo))
}

/** What «Mis tipos» may store: the vigente values asked for, once each, in the list's order. */
export function tiposDeGanchoValidos(vocab: Vocabulario, valores: readonly string[]): string[] {
  const pedidos = new Set(valores)
  return vocab.gancho.todas.valores.map((valor) => valor.valor).filter((valor) => pedidos.has(valor))
}

/** Favorites first, then the newest (spec 6b); the id breaks ties so the order never jumps between renders. */
export function ordenarGanchos<T extends Pick<GanchoDeLista, "afirmacionId" | "creadoEn" | "favorito">>(
  ganchos: readonly T[],
): T[] {
  return ganchos.toSorted(
    (a, b) =>
      Number(b.favorito) - Number(a.favorito) ||
      Date.parse(b.creadoEn) - Date.parse(a.creadoEn) ||
      a.afirmacionId.localeCompare(b.afirmacionId),
  )
}

function distintas(opciones: readonly (Opcion | null)[]): Opcion[] {
  const porId = new Map<string, Opcion>()
  for (const opcion of opciones) if (opcion) porId.set(opcion.id, opcion)
  return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

/** The authors and topics the filters offer: only those that have a hook. */
export function opcionesDeFiltros(ganchos: readonly GanchoDeLista[]): { autores: Opcion[]; temas: Opcion[] } {
  return {
    autores: distintas(ganchos.map((gancho) => gancho.autor)),
    temas: distintas(ganchos.map((gancho) => gancho.tema)),
  }
}
