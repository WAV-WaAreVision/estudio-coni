import { DE_CONI } from "@/lib/dominio/fuente"

// A LinkedIn document carousel (design 2026-10-26, D2, D3): designed text, signed by Coni, no avatar.

export type TipoDeLamina = "portada" | "idea" | "cierre"

export interface Lamina {
  tipo: TipoDeLamina
  texto: string
  /** One of its own words, highlighted by the template (part 2). Design, not text: outside `hash_texto`. */
  destacado?: string
  /** The closing slide's source line (`lineaDeFuente`), added by the app and never by Claude. */
  fuente?: string
}

/** What gate 1 signs: the slides' words and the post text. */
export interface TextoDeCarrusel {
  laminas: readonly Lamina[]
  textoPost: string
}

/** What Claude writes (`SalidaCarrusel` in lib/proveedores/anthropic.ts). */
export interface EscritoDeCarrusel {
  portada: { texto: string }
  ideas: readonly { texto: string; destacado: string | null }[]
  cierre: { pregunta: string }
  textoPost: string
}

export const MINIMO_DE_IDEAS_DEL_CARRUSEL = 4
export const MAXIMO_DE_IDEAS_DEL_CARRUSEL = 6
/** C8. Mirrors pedir_cambio_de_carrusel (supabase/migrations/20261026000130_carrusel_firma_vigente.sql). */
export const MAXIMO_CAMBIOS_DE_TEXTO = 3
/** Said on the gate and by the action when the three are spent: one text, so both say the same number. */
export const TEXTO_SIN_CAMBIOS_DE_TEXTO = `Ya pediste ${MAXIMO_CAMBIOS_DE_TEXTO} cambios. Puedes firmarlo como está.`
/** Mirrors the same function's bound on her sentence. */
export const MAXIMO_DEL_PEDIDO = 500
/** C11: the carousel is hers, under her full name. */
export const FIRMA_DEL_CARRUSEL = "Constanza del Rosario"

const NOMBRES: Record<TipoDeLamina, string> = { portada: "Portada", idea: "Idea", cierre: "Cierre" }

/** CRLF to LF, NFC and trimmed, as every text the app stores (`normalizarTexto`). */
function limpio(texto: string): string {
  return texto.replace(/\r\n?/g, "\n").normalize("NFC").trim()
}

/** The words of a text as the hash and the highlight see them. */
export const palabrasDe = (texto: string): string[] => texto.match(/[\p{L}\p{N}]+/gu) ?? []

/** A source line worth printing: Coni's own backing is not cited (`conLineaDeFuente` does the same). */
function lineaCitable(linea: string | null): string | null {
  return linea === null || linea === DE_CONI ? null : linea
}

/** The slides as stored: the portada, the ideas and the closing question with the app's source line. */
export function laminasDelEscrito(escrito: EscritoDeCarrusel, lineaDeFuente: string | null): Lamina[] {
  const fuente = lineaCitable(lineaDeFuente)
  const ideas = escrito.ideas.map((idea): Lamina => {
    const texto = limpio(idea.texto)
    const destacado = idea.destacado === null ? null : limpio(idea.destacado)
    // A word Claude highlighted that is not on the slide would be highlighted nowhere: it is dropped.
    return destacado && palabrasDe(texto).includes(destacado)
      ? { tipo: "idea", texto, destacado }
      : { tipo: "idea", texto }
  })
  return [
    { tipo: "portada", texto: limpio(escrito.portada.texto) },
    ...ideas,
    { tipo: "cierre", texto: limpio(escrito.cierre.pregunta), ...(fuente ? { fuente } : {}) },
  ]
}

/** The post as published: Claude's text, then the source line and the signature, both the app's (D3, C11). */
export function textoDeLaPublicacion(texto: string, lineaDeFuente: string | null): string {
  const cuerpo = limpio(texto)
  const fuente = lineaCitable(lineaDeFuente)
  const partes = [cuerpo]
  if (fuente && !cuerpo.includes(fuente)) partes.push(fuente)
  if (!cuerpo.endsWith(FIRMA_DEL_CARRUSEL)) partes.push(FIRMA_DEL_CARRUSEL)
  return partes.join("\n\n")
}

/**
 * The words a carousel says, in order, whatever slides they sit on: splitting, merging or highlighting keeps them
 * (design D5), so `hash_texto` and gate 1 stand.
 */
export function palabrasDelCarrusel(laminas: readonly Lamina[]): string {
  return laminas
    .flatMap((lamina) => [lamina.texto, lamina.fuente ?? ""])
    .join(" ")
    .normalize("NFC")
    .split(/\s+/u)
    .filter((palabra) => palabra !== "")
    .join(" ")
}

/** "Lámina 3 · Idea". */
export function nombreDeLamina(lamina: Lamina, indice: number): string {
  return `Lámina ${indice + 1} · ${NOMBRES[lamina.tipo]}`
}

/** How many "Pedir cambio" are left after `hechos` text changes. */
export function cambiosQuedan(hechos: number): number {
  return Math.max(0, MAXIMO_CAMBIOS_DE_TEXTO - hechos)
}
