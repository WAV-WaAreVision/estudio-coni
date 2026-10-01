import type { Pilar } from "@/lib/dominio/pilares"
import { type Alerta, TIPOS_DE_ALERTA } from "@/lib/dominio/revision"

/** An idea as `contenido/ideas/banco.md` writes it, ready for the `ideas` table. */
export interface IdeaDelBanco {
  numero: number
  pilar: Pilar
  gancho: string
  tema: string
  formato: string
  fuerza: "alta" | "media" | "baja"
  alertas: Alerta[]
  fuentes: string[]
  estado: "idea" | "usada"
}

/** The headings of the pillar tables. Any other table of the file (summary, patterns, accounts) is not an idea. */
const PILAR_POR_TITULO: Record<string, Pilar> = {
  "Pareja y conversación": "pareja",
  "Deseo y sexualidad": "deseo",
  'Autoestima y "ser tu propia diosa"': "autoestima",
  "Género y límites": "limites",
  "Bienestar emocional": "bienestar",
}

const FUERZAS = ["alta", "media", "baja"] as const
const COLUMNAS = 8

function celdasDe(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((celda) => celda.replace(/\\\|/g, "|").trim())
}

/** `**líneas de ayuda · verificar dato:** texto<br>**nota:** texto` becomes one alert per type, in order of appearance. */
function leerAlertas(celda: string, numero: string): Alerta[] {
  if (celda === "") return []
  const textosPorTipo = new Map<string, string[]>()
  for (const segmento of celda.split("<br>")) {
    const partes = /^\*\*(.+?):\*\*\s*([\s\S]*)$/.exec(segmento.trim())
    if (!partes?.[1]) throw new Error(`La idea ${numero} tiene una alerta que no se entiende: «${segmento.trim()}».`)
    const texto = (partes[2] ?? "").trim()
    for (const tipo of partes[1].split("·").map((t) => t.trim())) {
      if (!TIPOS_DE_ALERTA.some((conocido) => conocido === tipo))
        throw new Error(`La idea ${numero} tiene un tipo de alerta desconocido: ${tipo}.`)
      const textos = textosPorTipo.get(tipo) ?? []
      if (!textos.includes(texto)) textos.push(texto)
      textosPorTipo.set(tipo, textos)
    }
  }
  return [...textosPorTipo].map(([tipo, textos]) => ({ tipo, texto: textos.join(" ") }))
}

function leerFuentes(celda: string): string[] {
  const fuentes = celda
    .split("<br>")
    .map((fuente) => fuente.trim())
    .filter((fuente) => fuente !== "")
  return [...new Set(fuentes)]
}

function leerFuerza(celda: string, numero: string): IdeaDelBanco["fuerza"] {
  const fuerza = FUERZAS.find((candidata) => candidata === celda)
  if (!fuerza) throw new Error(`La idea ${numero} tiene una fuerza desconocida: «${celda}».`)
  return fuerza
}

function leerEstado(celda: string, numero: string): IdeaDelBanco["estado"] {
  if (celda === "idea") return "idea"
  if (celda === "usada" || celda.startsWith("usada:")) return "usada"
  throw new Error(`La idea ${numero} tiene un estado desconocido: «${celda}».`)
}

/**
 * Reads the bank. A row it cannot read stops the import with the idea's number, because a half-read bank would be
 * imported as if it were whole.
 */
export function parsearBanco(markdown: string): IdeaDelBanco[] {
  const ideas: IdeaDelBanco[] = []
  const vistos = new Set<number>()
  let pilar: Pilar | null = null

  for (const linea of markdown.split(/\r?\n/)) {
    const titulo = /^## (.+?)\s*$/.exec(linea)
    if (titulo?.[1]) {
      pilar = PILAR_POR_TITULO[titulo[1]] ?? null
      continue
    }
    if (!pilar || !/^\|\s*\d+\s*\|/.test(linea)) continue

    const celdas = celdasDe(linea)
    const [
      numeroTexto = "",
      gancho = "",
      tema = "",
      formato = "",
      fuerza = "",
      revisar = "",
      fuentes = "",
      estado = "",
    ] = celdas
    if (celdas.length !== COLUMNAS) {
      throw new Error(`La idea ${numeroTexto} tiene ${celdas.length} columnas y el banco usa ${COLUMNAS}.`)
    }
    const numero = Number(numeroTexto)
    if (vistos.has(numero)) throw new Error(`El número ${numeroTexto} está repetido en el banco.`)
    vistos.add(numero)

    ideas.push({
      numero,
      pilar,
      gancho,
      tema,
      formato,
      fuerza: leerFuerza(fuerza, numeroTexto),
      alertas: leerAlertas(revisar, numeroTexto),
      fuentes: leerFuentes(fuentes),
      estado: leerEstado(estado, numeroTexto),
    })
  }

  if (ideas.length === 0) throw new Error("El archivo no trae ninguna idea.")
  return ideas
}
