import {
  type CatalogoDePilares,
  type FilaDePilarElegida,
  NOMBRE_DE_RED,
  pilaresDeRedes,
  REDES,
  type Red,
} from "@/lib/dominio/pilares"
import {
  costoClaude,
  guiaDePilaresPorRed,
  type IdeaPorClasificar,
  MODELO_POR_TAREA,
  type PropuestaDeIdeaPorRed,
  type PropuestaDeTema,
  pedidoDePilaresPorRed,
  sinRaya,
  type TemaPorClasificar,
} from "@/lib/proveedores/anthropic"
import { camposDeCsv } from "./reclasificar"

/** The lot of the reclassification into pillars per network (spec 2026-11-04, section 3). */
export const LOTE_PILARES_POR_RED = "pilares-por-red-2026-11"

/** A topic to classify, with the name of the category it came from ("" for none). */
export interface TemaParaProponer extends TemaPorClasificar {
  veniaDe: string
}

/** A bank idea on a pillar of 2026-10-17, with that pillar's short name. */
export interface IdeaParaProponer extends IdeaPorClasificar {
  veniaDe: string
}

export const COLUMNAS_POR_RED = [
  "tipo",
  "id",
  "nombre",
  "linkedin",
  "instagram",
  "secundarios",
  "capa_tdah",
  "pilar_nuevo",
  "venia_de",
  "razon",
] as const

/**
 * One row of the CSV Federico reviews with Coni's corrections. Topics fill `linkedin`, `instagram` (slugs or ""),
 * `secundarios` (slugs separated by ";") and `capa_tdah` ("si" or "no"); ideas fill `pilar_nuevo`.
 */
export interface FilaPorRed {
  tipo: "tema" | "idea"
  id: string
  nombre: string
  linkedin: string
  instagram: string
  secundarios: string
  capa_tdah: string
  pilar_nuevo: string
  venia_de: string
  razon: string
}

/** What `aplicar_lote_de_pilares` takes, before it becomes JSON. */
export interface FilasDelLote {
  temas: { temaId: string; pilares: FilaDePilarElegida[] }[]
  ideas: { ideaId: string; pilar: string }[]
}

export function filasDePropuesta(
  temas: readonly TemaParaProponer[],
  ideas: readonly IdeaParaProponer[],
  propuesta: { temas: readonly PropuestaDeTema[]; ideas: readonly PropuestaDeIdeaPorRed[] },
): FilaPorRed[] {
  const deTema = new Map(propuesta.temas.map((p) => [p.id, p]))
  const deIdea = new Map(propuesta.ideas.map((p) => [p.id, p]))
  const vacia = { linkedin: "", instagram: "", secundarios: "", capa_tdah: "", pilar_nuevo: "" }
  return [
    ...temas.map((tema): FilaPorRed => {
      const p = deTema.get(tema.id)
      return {
        ...vacia,
        tipo: "tema",
        id: tema.id,
        nombre: tema.nombre,
        linkedin: p?.linkedin ?? "",
        instagram: p?.instagram ?? "",
        secundarios: (p?.secundarios ?? []).join(";"),
        capa_tdah: p?.capa ? "si" : "no",
        venia_de: tema.veniaDe,
        razon: p?.razon ?? "",
      }
    }),
    ...ideas.map((idea): FilaPorRed => {
      const p = deIdea.get(idea.id)
      return {
        ...vacia,
        tipo: "idea",
        id: idea.id,
        nombre: idea.gancho,
        pilar_nuevo: p?.pilar ?? "",
        venia_de: idea.veniaDe,
        razon: p?.razon ?? "",
      }
    }),
  ]
}

const comillas = (campo: string) => `"${campo.replaceAll('"', '""')}"`

export function aCsvPorRed(filas: readonly FilaPorRed[]): string {
  const lineas = [
    COLUMNAS_POR_RED.map(comillas).join(","),
    ...filas.map((fila) => COLUMNAS_POR_RED.map((columna) => comillas(fila[columna])).join(",")),
  ]
  return `${lineas.join("\n")}\n`
}

/** The row Federico sees in his spreadsheet: the header is row 1. Every message about the CSV uses it. */
export const filaDeHoja = (indice: number) => indice + 2

export function leerCsvPorRed(texto: string): FilaPorRed[] {
  const [cabecera, ...resto] = camposDeCsv(texto.replace(/^\uFEFF/, ""))
  if (!cabecera || cabecera.valores.join(",") !== COLUMNAS_POR_RED.join(",")) {
    throw new Error(
      `La primera línea tiene que ser: ${COLUMNAS_POR_RED.join(",")}. ¿Lo guardaste con punto y coma? Expórtalo como CSV UTF-8 separado por comas.`,
    )
  }
  const errores: string[] = []
  const filas = resto.flatMap(({ valores }, indice): FilaPorRed[] => {
    const donde = `Fila ${filaDeHoja(indice)}`
    const [
      tipo = "",
      id = "",
      nombre = "",
      linkedin = "",
      instagram = "",
      secundarios = "",
      capa_tdah = "",
      pilar_nuevo = "",
      venia_de = "",
      razon = "",
    ] = valores.map((valor) => valor.trim())
    const antes = errores.length
    if (id === "") errores.push(`${donde}: falta el id.`)
    if (tipo !== "tema" && tipo !== "idea") errores.push(`${donde}: tipo desconocido «${tipo}».`)
    if (valores.length > COLUMNAS_POR_RED.length) {
      errores.push(`${donde}: tiene ${valores.length} valores y el CSV tiene ${COLUMNAS_POR_RED.length} columnas.`)
    }
    if (errores.length > antes || (tipo !== "tema" && tipo !== "idea")) return []
    return [{ tipo, id, nombre, linkedin, instagram, secundarios, capa_tdah, pilar_nuevo, venia_de, razon }]
  })
  if (errores.length > 0) throw new Error(`El CSV tiene errores:\n${errores.join("\n")}`)
  return filas
}

// Coni's copy bans em dashes; a topic name or a hook from the bank may still carry one.
const celda = (texto: string) => sinRaya(texto).replaceAll("|", "\\|").replaceAll("\n", " ")
/** «Sí», «SI» or «no» as typed in a spreadsheet; anything else stays as it was, for the error to quote. */
const capaTdah = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const slugsDe = (lista: string) =>
  lista
    .split(";")
    .map((slug) => slug.trim())
    .filter((slug) => slug !== "")

/** The list Federico sends Coni: her columns plus «Venía de» (spec section 3), pillars by their short names. */
export function aMarkdownParaConi(filas: readonly FilaPorRed[], catalogo: CatalogoDePilares): string {
  const nombre = (slug: string) => catalogo.find((pilar) => pilar.slug === slug)?.nombreCorto ?? slug
  const temas = filas.filter((fila) => fila.tipo === "tema")
  const ideas = filas.filter((fila) => fila.tipo === "idea")
  const lineas = [
    "# Pilares por red: propuesta para revisar",
    "",
    "Cada tema puede tener pilar en LinkedIn, en Instagram, en las dos redes o en ninguna. Corrige lo que no calce.",
    "",
    "## Temas",
    "",
    "| Tema | Principal LinkedIn | Principal Instagram | Secundarios | Capa TDAH | Venía de |",
    "|---|---|---|---|---|---|",
    ...temas
      .map((fila) =>
        [
          celda(fila.nombre),
          fila.linkedin ? nombre(fila.linkedin) : "Sin pilar",
          fila.instagram ? nombre(fila.instagram) : "Sin pilar",
          slugsDe(fila.secundarios).map(nombre).join(", ") || "Ninguno",
          capaTdah(fila.capa_tdah) === "si" ? "Sí" : "No",
          fila.venia_de ? celda(fila.venia_de) : "Sin pilar",
        ].join(" | "),
      )
      .map((linea) => `| ${linea} |`),
    "",
    "## Ideas",
    "",
    "| Idea | Pilar nuevo | Venía de |",
    "|---|---|---|",
    ...ideas.map(
      (fila) =>
        `| ${celda(fila.nombre)} | ${fila.pilar_nuevo ? nombre(fila.pilar_nuevo) : "Sin proponer"} | ${fila.venia_de ? celda(fila.venia_de) : "Sin pilar"} |`,
    ),
  ]
  return `${lineas.join("\n")}\n`
}

/** The reviewed CSV as the lot's rows. Every mistake is listed at once, so one review round fixes them all. */
export function filasDelLote(filas: readonly FilaPorRed[], catalogo: CatalogoDePilares): FilasDelLote {
  const deRedes = pilaresDeRedes(catalogo)
  const pilarDe = (slug: string) => deRedes.find((pilar) => pilar.slug === slug && !pilar.esCapa)
  const capa = deRedes.find((pilar) => pilar.esCapa)
  const errores: string[] = []
  const vistos = new Set<string>()
  const resultado: FilasDelLote = { temas: [], ideas: [] }

  filas.forEach((fila, indice) => {
    const donde = `Fila ${filaDeHoja(indice)} (${fila.tipo} ${fila.id})`
    if (!ES_UUID.test(fila.id)) errores.push(`${donde}: el id no es válido.`)
    // The database compares ids without case: two spellings of one id are the same row.
    const clave = fila.id.toLowerCase()
    if (vistos.has(clave)) errores.push(`${donde}: el id está repetido.`)
    vistos.add(clave)

    if (fila.tipo === "idea") {
      const pilar = pilarDe(fila.pilar_nuevo)
      if (!pilar) errores.push(`${donde}: «${fila.pilar_nuevo}» no es un pilar activo de una red.`)
      else resultado.ideas.push({ ideaId: fila.id, pilar: pilar.slug })
      return
    }

    const principalDe: Record<Red, string> = { linkedin: fila.linkedin, instagram: fila.instagram }
    const principales = REDES.flatMap((red): FilaDePilarElegida[] => {
      const slug = principalDe[red]
      if (slug === "") return []
      if (pilarDe(slug)?.red !== red) {
        errores.push(`${donde}: «${slug}» no es un pilar de ${NOMBRE_DE_RED[red]}.`)
        return []
      }
      return [{ pilar: slug, fuerza: "alta" }]
    })
    const yaNombrados = new Set<string>()
    const secundarios = slugsDe(fila.secundarios).flatMap((slug): FilaDePilarElegida[] => {
      if (yaNombrados.has(slug)) {
        errores.push(`${donde}: «${slug}» está repetido en Secundarios.`)
        return []
      }
      yaNombrados.add(slug)
      const pilar = pilarDe(slug)
      if (!pilar) {
        errores.push(`${donde}: «${slug}» no es un pilar activo de una red.`)
        return []
      }
      if (principalDe[pilar.red] === "") {
        errores.push(
          `${donde}: «${slug}» va en Secundarios pero el tema no tiene pilar en ${NOMBRE_DE_RED[pilar.red]}.`,
        )
        return []
      }
      return principalDe[pilar.red] === slug ? [] : [{ pilar: slug, fuerza: "media" }]
    })
    const capas: FilaDePilarElegida[] = []
    const conCapa = capaTdah(fila.capa_tdah)
    if (conCapa !== "si" && conCapa !== "no") {
      errores.push(`${donde}: Capa TDAH tiene que ser si o no, no «${fila.capa_tdah}».`)
    } else if (conCapa === "si") {
      if (capa) capas.push({ pilar: capa.slug, fuerza: null })
      else errores.push(`${donde}: no hay una capa activa.`)
    }
    resultado.temas.push({ temaId: fila.id, pilares: [...principales, ...secundarios, ...capas] })
  })

  if (errores.length > 0) throw new Error(`El CSV tiene errores:\n${errores.join("\n")}`)
  return resultado
}

const CARACTERES_POR_TOKEN = 4
// Two slugs, a few secondaries, a one-sentence Spanish reason and the JSON keys per item.
const TOKENS_DE_SALIDA_POR_ELEMENTO = 120

/** Printed before the call: US$ from list prices, for the guide and the user message as sent. */
export function estimarPropuestaPorRed(entrada: {
  pilares: CatalogoDePilares
  temas: readonly TemaPorClasificar[]
  ideas: readonly IdeaPorClasificar[]
}): number {
  const caracteres =
    guiaDePilaresPorRed(entrada.pilares).length + pedidoDePilaresPorRed(entrada.temas, entrada.ideas).length
  const usd = costoClaude(
    {
      input_tokens: Math.ceil(caracteres / CARACTERES_POR_TOKEN),
      output_tokens: TOKENS_DE_SALIDA_POR_ELEMENTO * (entrada.temas.length + entrada.ideas.length),
    },
    MODELO_POR_TAREA.proponerPilaresPorRed.modelo,
  )
  return Number(usd.toFixed(4))
}
