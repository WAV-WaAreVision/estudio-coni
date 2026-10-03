import type { Parte, Ubicacion } from "@/lib/ingesta/partes"
import { posicionTalCual } from "@/lib/ingesta/texto-seguro"

/** Characters of source text per request: keeps the echoed answer well under MAX_TOKENS. */
export const CARACTERES_POR_TRAMO = 12_000

const SEPARADOR_DE_PARTES = "\n\n"

export interface Trozo {
  texto: string
  /** What goes between the previous chunk and this one when the part is put back together. */
  antes: string
}

const NIVELES_DE_CORTE: readonly { separador: RegExp; union: string }[] = [
  { separador: /\n{2,}/, union: "\n\n" },
  { separador: /(?<=[.!?…])\s+/, union: " " },
]

/** Splits at paragraphs, then sentences, then a hard cut; chunks are packed as full as the limit allows. */
export function trocear(texto: string, limite = CARACTERES_POR_TRAMO, nivel = 0): Trozo[] {
  if (texto.length <= limite) return [{ texto, antes: "" }]
  const corte = NIVELES_DE_CORTE[nivel]
  if (!corte) {
    const trozos: Trozo[] = []
    for (let desde = 0; desde < texto.length; desde += limite)
      trozos.push({ texto: texto.slice(desde, desde + limite), antes: "" })
    return trozos
  }
  const resultado: Trozo[] = []
  for (const unidad of texto.split(corte.separador)) {
    const piezas = trocear(unidad, limite, nivel + 1)
    const ultimo = resultado.at(-1)
    const [primera] = piezas
    if (
      ultimo &&
      piezas.length === 1 &&
      primera &&
      ultimo.texto.length + corte.union.length + primera.texto.length <= limite
    ) {
      ultimo.texto += corte.union + primera.texto
      continue
    }
    resultado.push(
      ...piezas.map((pieza, i) => (i === 0 && resultado.length > 0 ? { ...pieza, antes: corte.union } : pieza)),
    )
  }
  return resultado
}

export interface PiezaDeTramo {
  /** Offsets inside the chunk's joined text. */
  desde: number
  hasta: number
  ubicacion: Ubicacion
}

export interface Tramo {
  /** From 1. */
  numero: number
  texto: string
  /** Where the chunk starts in its source. */
  ubicacion: Ubicacion
  piezas: PiezaDeTramo[]
}

/**
 * Packs the parts into chunks of at most CARACTERES_POR_TRAMO characters, in order. A part longer than the limit is
 * split first; chunks join the pieces they hold with a blank line. `piezas` says which location each stretch came from.
 */
export function aTramos(partes: readonly Parte[]): Tramo[] {
  const piezas = partes.flatMap((parte) =>
    parte.texto.trim() === ""
      ? []
      : trocear(parte.texto).map((trozo) => ({ texto: trozo.texto, ubicacion: parte.ubicacion })),
  )
  const tramos: Tramo[] = []
  for (const pieza of piezas) {
    const ultimo = tramos.at(-1)
    if (ultimo && ultimo.texto.length + SEPARADOR_DE_PARTES.length + pieza.texto.length <= CARACTERES_POR_TRAMO) {
      const desde = ultimo.texto.length + SEPARADOR_DE_PARTES.length
      ultimo.texto += SEPARADOR_DE_PARTES + pieza.texto
      ultimo.piezas.push({ desde, hasta: ultimo.texto.length, ubicacion: pieza.ubicacion })
      continue
    }
    tramos.push({
      numero: tramos.length + 1,
      texto: pieza.texto,
      ubicacion: pieza.ubicacion,
      piezas: [{ desde: 0, hasta: pieza.texto.length, ubicacion: pieza.ubicacion }],
    })
  }
  return tramos
}

/** The location of the piece where the quote starts; the chunk's first location when the quote is not in it. */
export function ubicacionDeCita(tramo: Tramo, cita: string): Ubicacion {
  const posicion = posicionTalCual(tramo.texto, cita)
  if (!posicion) return tramo.ubicacion
  const pieza = tramo.piezas.find((p) => posicion.desde >= p.desde && posicion.desde < p.hasta)
  return pieza?.ubicacion ?? tramo.ubicacion
}
