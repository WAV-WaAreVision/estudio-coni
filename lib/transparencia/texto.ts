import { URL_DE_LA_APP } from "@/lib/diseno/marca"

export const TITULO_DE_TRANSPARENCIA = "Cómo uso IA en mi contenido"

/** The limits of `transparencia_versiones.texto`: long enough to say something, short enough to read. */
export const LARGO_MINIMO_TRANSPARENCIA = 300
export const LARGO_MAXIMO_TRANSPARENCIA = 6000

/** What she pastes in her bios (spec, rollout step 4). */
export const LINEA_PARA_LA_BIO = `${TITULO_DE_TRANSPARENCIA}: ${URL_DE_LA_APP.replace(/^https?:\/\//, "")}/l/ia`

const BORDES = /^[ \t\n]+|[ \t\n]+$/g

/** The same normalisation as `publicar_transparencia`: Windows line ends become plain ones, the edges are trimmed. */
export function normalizarTexto(texto: string): string {
  return texto.replace(/\r\n/g, "\n").replace(BORDES, "")
}

/** Characters as `char_length` counts them: code points, so an emoji is one. */
export function largoDeTexto(texto: string): number {
  return [...normalizarTexto(texto)].length
}

/** Spec D5: plain text, a blank line between paragraphs. Never markdown or HTML: React prints it as text. */
export function parrafos(texto: string): string[] {
  return normalizarTexto(texto)
    .split(/\n[ \t]*\n/)
    .map((parrafo) => parrafo.replace(BORDES, ""))
    .filter((parrafo) => parrafo !== "")
}
