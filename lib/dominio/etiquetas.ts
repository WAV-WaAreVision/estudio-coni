/**
 * ElevenLabs v3 and v4 take a word in square brackets as a direction and do not read it aloud. The writer may only use
 * this closed list (no laughs). Anything else in brackets is warned about and never reaches the voice.
 */
export const ETIQUETAS_DE_TONO = [
  "warm",
  "softly",
  "gentle",
  "reassuring",
  "encouraging",
  "thoughtful",
  "empathetic",
  "calm",
  "confident",
  "clear",
  "casual",
  "matter-of-fact",
  "pause",
  "sighs",
] as const
export type EtiquetaDeTono = (typeof ETIQUETAS_DE_TONO)[number]

/** How reading mode names each mark for Coni; the editor keeps the bracketed English the voice reads. */
export const NOMBRE_DE_TONO: Record<EtiquetaDeTono, string> = {
  warm: "cálido",
  softly: "suave",
  gentle: "delicado",
  reassuring: "tranquilizador",
  encouraging: "alentador",
  thoughtful: "reflexivo",
  empathetic: "empático",
  calm: "sereno",
  confident: "seguro",
  clear: "claro",
  casual: "casual",
  "matter-of-fact": "directo",
  pause: "pausa",
  sighs: "suspiro",
}
export const MINIMO_DE_ETIQUETAS = 3
export const MAXIMO_DE_ETIQUETAS = 6

export interface Etiqueta {
  /** As written in the text, brackets included: what Coni has to find and fix. */
  escrita: string
  nombre: string
  conocida: boolean
}

// A word or a few words in brackets. Digits or symbols inside are not a mark, so the symbol rule still catches them.
const ETIQUETA = /\[(\p{L}[\p{L}' -]{0,38})\]/gu
const CONOCIDAS: ReadonlySet<string> = new Set(ETIQUETAS_DE_TONO)
// eleven_v3 and eleven_v4 and their variants; anything else (v2, turbo, flash, an unknown future model) would read
// the marks aloud, and a flat voice is the safer failure.
const MODELO_CON_ETIQUETAS = /^eleven_v[34](?:_|$)/

const nombreDe = (marca: string) => marca.slice(1, -1).trim().toLowerCase()

const esConocida = (nombre: string): nombre is EtiquetaDeTono => CONOCIDAS.has(nombre)

/** A mark as reading mode shows it: its Spanish name, or as written when it is not on the list. */
export function nombreDeMarca(marca: string): string {
  const nombre = nombreDe(marca)
  return esConocida(nombre) ? NOMBRE_DE_TONO[nombre] : marca
}

export function etiquetasDe(texto: string): Etiqueta[] {
  return Array.from(texto.matchAll(ETIQUETA), ([marca]) => {
    const nombre = nombreDe(marca)
    return { escrita: marca, nombre, conocida: CONOCIDAS.has(nombre) }
  })
}

function quitar(texto: string, sobra: (nombre: string) => boolean): string {
  let quito = false
  const sin = texto.replace(ETIQUETA, (marca: string) => {
    const nombre = nombreDe(marca)
    // A kept mark is written in its canonical form, so "[Warm]" and "[warm ]" reach the voice as "[warm]".
    if (!sobra(nombre)) return `[${nombre}]`
    quito = true
    // A space, not nothing: "hola[pause]chao" must not become one word. The tidy-up below collapses doubles.
    return " "
  })
  // Only a text that lost a mark is tidied: a script without marks must stay byte for byte the same, or every older
  // voice fingerprint and subtitle golden would change.
  if (!quito) return sin
  return sin
    .split("\n")
    .map((linea) =>
      linea
        .replace(/[ \t]{2,}/g, " ")
        .replace(/ +([,.;:!?…])/g, "$1")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export interface ParteDeGuion {
  tipo: "texto" | "marca"
  valor: string
}

/** The script cut at its tone marks, so reading mode can draw them as chips. Joined back it is the script, character for character. */
export function partirEnMarcas(guion: string): ParteDeGuion[] {
  const partes: ParteDeGuion[] = []
  let desde = 0
  for (const coincidencia of guion.matchAll(ETIQUETA)) {
    const inicio = coincidencia.index ?? 0
    if (inicio > desde) partes.push({ tipo: "texto", valor: guion.slice(desde, inicio) })
    partes.push({ tipo: "marca", valor: coincidencia[0] })
    desde = inicio + coincidencia[0].length
  }
  if (desde < guion.length) partes.push({ tipo: "texto", valor: guion.slice(desde) })
  return partes
}

/** The spoken text: what subtitles, counts and checks see. */
export function sinEtiquetas(texto: string): string {
  return quitar(texto, () => true)
}

export function admiteEtiquetas(modelo: string): boolean {
  return MODELO_CON_ETIQUETAS.test(modelo)
}

/** The exact text ElevenLabs receives with this model. The voice fingerprint hashes this, not the stored script. */
export function textoParaVoz(guion: string, modelo: string): string {
  return admiteEtiquetas(modelo) ? quitar(guion, (nombre) => !CONOCIDAS.has(nombre)) : sinEtiquetas(guion)
}
