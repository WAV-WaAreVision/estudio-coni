import { z } from "zod"
import {
  type Lamina,
  MAXIMO_DE_IDEAS_DEL_CARRUSEL,
  MINIMO_DE_IDEAS_DEL_CARRUSEL,
  palabrasDe,
} from "@/lib/dominio/carrusel"
import { Falla } from "@/lib/dominio/falla"

// Design changes at gate 2 (design 2026-10-26, D5; plan amendment 5): bounded, and none of them changes a word, so
// `hash_texto` and gate 1 stand. `cambiar_diseno_de_carrusel` (20261027000120) checks the same in SQL: the same words
// (spaces as JavaScript's \s sees them), each slide's keys, the source line only on the closing slide, and a highlight
// only one of its own slide's words as `palabrasDe` reads them.

export const VARIANTES = ["crema", "piedra", "oscura"] as const
export type Variante = (typeof VARIANTES)[number]
export interface DisenoDeCarrusel {
  variante: Variante
}
export const DISENO_INICIAL: DisenoDeCarrusel = { variante: "crema" }
export const NOMBRE_DE_VARIANTE: Record<Variante, string> = { crema: "Crema", piedra: "Piedra", oscura: "Oscura" }

const esquemaDeDiseno = z.object({ variante: z.enum(VARIANTES) }).strict()

/** `carruseles.diseno` as stored: written only by the database functions, so another shape is a bug. */
export function leerDiseno(valor: unknown): DisenoDeCarrusel {
  const resultado = esquemaDeDiseno.safeParse(valor)
  if (!resultado.success) throw new Error(`El diseño guardado no tiene el formato esperado: ${resultado.error.message}`)
  return resultado.data
}

export type CambioDeDiseno =
  | { tipo: "variante"; variante: Variante }
  /** `lamina` is the slide's index (0 is the portada). */
  | { tipo: "dividir"; lamina: number }
  | { tipo: "unir"; lamina: number }
  | { tipo: "destacar"; lamina: number; palabra: string | null }

export class DisenoInvalido extends Falla {
  constructor() {
    super("Ese cambio de diseño no se puede hacer en esta lámina.")
    this.name = "DisenoInvalido"
  }
}

/** A text's sentences, split after `.`, `!`, `?` or `…` and the space that follows; the punctuation stays. */
export function frasesDe(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+/u)
    .map((frase) => frase.trim())
    .filter((frase) => frase !== "")
}

const ideasDe = (laminas: readonly Lamina[]) => laminas.filter((lamina) => lamina.tipo === "idea").length

export function puedeDividir(laminas: readonly Lamina[], indice: number): boolean {
  const lamina = laminas[indice]
  return (
    lamina?.tipo === "idea" && frasesDe(lamina.texto).length >= 2 && ideasDe(laminas) < MAXIMO_DE_IDEAS_DEL_CARRUSEL
  )
}

export function puedeUnir(laminas: readonly Lamina[], indice: number): boolean {
  return (
    laminas[indice]?.tipo === "idea" &&
    laminas[indice + 1]?.tipo === "idea" &&
    ideasDe(laminas) > MINIMO_DE_IDEAS_DEL_CARRUSEL
  )
}

/** The words she can highlight on a slide, once each, in order. */
export function palabrasDestacables(lamina: Lamina): string[] {
  return [...new Set(palabrasDe(lamina.texto))]
}

/** Keeps a highlight only on the half (or whole) whose words include it. */
function conDestacado(lamina: Lamina, destacado: string | undefined): Lamina {
  return destacado !== undefined && palabrasDe(lamina.texto).includes(destacado) ? { ...lamina, destacado } : lamina
}

function dividir(laminas: readonly Lamina[], indice: number): Lamina[] {
  const lamina = laminas[indice]
  if (!lamina || !puedeDividir(laminas, indice)) throw new DisenoInvalido()
  const frases = frasesDe(lamina.texto)
  const total = lamina.texto.length
  let corte = 1
  for (let k = 1; k < frases.length; k += 1) {
    const izquierda = frases.slice(0, k).join(" ").length
    const mejor = frases.slice(0, corte).join(" ").length
    if (Math.abs(total / 2 - izquierda) < Math.abs(total / 2 - mejor)) corte = k
  }
  const primera: Lamina = { tipo: "idea", texto: frases.slice(0, corte).join(" ") }
  const segunda: Lamina = { tipo: "idea", texto: frases.slice(corte).join(" ") }
  const enLaPrimera = lamina.destacado !== undefined && palabrasDe(primera.texto).includes(lamina.destacado)
  return [
    ...laminas.slice(0, indice),
    conDestacado(primera, lamina.destacado),
    enLaPrimera ? segunda : conDestacado(segunda, lamina.destacado),
    ...laminas.slice(indice + 1),
  ]
}

function unir(laminas: readonly Lamina[], indice: number): Lamina[] {
  const a = laminas[indice]
  const b = laminas[indice + 1]
  if (!a || !b || !puedeUnir(laminas, indice)) throw new DisenoInvalido()
  const unida = conDestacado({ tipo: "idea", texto: `${a.texto} ${b.texto}` }, a.destacado ?? b.destacado)
  return [...laminas.slice(0, indice), unida, ...laminas.slice(indice + 2)]
}

function destacar(laminas: readonly Lamina[], indice: number, palabra: string | null): Lamina[] {
  const lamina = laminas[indice]
  if (!lamina) throw new DisenoInvalido()
  if (palabra !== null && !palabrasDe(lamina.texto).includes(palabra)) throw new DisenoInvalido()
  const { destacado: _anterior, ...sinDestacado } = lamina
  const nueva: Lamina = palabra === null ? sinDestacado : { ...sinDestacado, destacado: palabra }
  return laminas.map((actual, i) => (i === indice ? nueva : actual))
}

/** One bounded design change (D5). Throws `DisenoInvalido` (a message for Coni) when it does not apply to that slide. */
export function aplicarCambioDeDiseno(
  laminas: readonly Lamina[],
  diseno: DisenoDeCarrusel,
  cambio: CambioDeDiseno,
): { laminas: Lamina[]; diseno: DisenoDeCarrusel } {
  switch (cambio.tipo) {
    case "variante":
      return { laminas: [...laminas], diseno: { variante: cambio.variante } }
    case "dividir":
      return { laminas: dividir(laminas, cambio.lamina), diseno }
    case "unir":
      return { laminas: unir(laminas, cambio.lamina), diseno }
    case "destacar":
      return { laminas: destacar(laminas, cambio.lamina, cambio.palabra), diseno }
  }
}
