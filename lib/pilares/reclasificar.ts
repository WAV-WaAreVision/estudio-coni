import { costoClaude, MODELO_POR_TAREA, pedidoDeReclasificacion } from "@/lib/proveedores/anthropic"

export const TIPOS = ["material", "tema", "teoria"] as const
export type TipoDeElemento = (typeof TIPOS)[number]

export interface ElementoPorClasificar {
  id: string
  tipo: TipoDeElemento
  /** What Claude reads: title, author and summary of a material; name and description of a topic; a theory's thesis. */
  texto: string
}

/** One row of the CSV WAV reviews: `antes` is the current slug ("" for none), `propuesta` what gets applied. */
export interface FilaDeReclasificacion {
  id: string
  tipo: TipoDeElemento
  antes: string
  propuesta: string
  razon: string
}

export const POR_TANDA = 40
const CARACTERES_POR_TOKEN = 4
// A UUID, a slug, a one-sentence Spanish reason and the JSON keys: about 105 tokens per item in the production run of
// 2026-10-17 (60 under-shot the real cost by 1.6x).
const TOKENS_DE_SALIDA_POR_ELEMENTO = 110
const COLUMNAS = ["id", "tipo", "antes", "propuesta", "razon"] as const

const comillas = (campo: string) => `"${campo.replaceAll('"', '""')}"`

export function aCsv(filas: readonly FilaDeReclasificacion[]): string {
  const lineas = [COLUMNAS.map(comillas).join(","), ...filas.map((f) => COLUMNAS.map((c) => comillas(f[c])).join(","))]
  return `${lineas.join("\n")}\n`
}

/** RFC 4180 fields: quoted or not, with doubled quotes and line breaks inside quotes. */
function campos(texto: string): { valores: string[]; linea: number }[] {
  const registros: { valores: string[]; linea: number }[] = []
  let valores: string[] = []
  let campo = ""
  let dentro = false
  let linea = 1
  let inicio = 1
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charAt(i)
    if (dentro) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') dentro = false
      else {
        if (c === "\n") linea++
        campo += c
      }
      continue
    }
    if (c === '"') dentro = true
    else if (c === ",") {
      valores.push(campo)
      campo = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++
      valores.push(campo)
      registros.push({ valores, linea: inicio })
      valores = []
      campo = ""
      linea++
      inicio = linea
    } else campo += c
  }
  if (campo !== "" || valores.length > 0) {
    valores.push(campo)
    registros.push({ valores, linea: inicio })
  }
  return registros.filter((r) => r.valores.some((v) => v.trim() !== ""))
}

export function leerCsv(texto: string): FilaDeReclasificacion[] {
  const [cabecera, ...resto] = campos(texto.replace(/^\uFEFF/, ""))
  if (!cabecera || cabecera.valores.join(",") !== COLUMNAS.join(",")) {
    throw new Error(`La primera línea tiene que ser: ${COLUMNAS.join(",")}`)
  }
  return resto.map(({ valores, linea }) => {
    const [id = "", tipo = "", antes = "", propuesta = "", razon = ""] = valores.map((v) => v.trim())
    const tipoLeido = TIPOS.find((t) => t === tipo)
    if (!tipoLeido) throw new Error(`Línea ${linea}: tipo desconocido «${tipo}».`)
    if (id === "" || propuesta === "") throw new Error(`Línea ${linea}: faltan el id o la propuesta.`)
    return { id, tipo: tipoLeido, antes, propuesta, razon }
  })
}

export function validarFilas(filas: readonly FilaDeReclasificacion[], permitidas: readonly string[]): void {
  const malas = filas.filter((f) => !permitidas.includes(f.propuesta))
  if (malas.length > 0) {
    throw new Error(
      `Propuestas que no son un pilar activo ni general: ${malas.map((f) => `${f.id} (${f.propuesta})`).join(", ")}.`,
    )
  }
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const f of filas) (vistos.has(f.id) ? repetidos : vistos).add(f.id)
  if (repetidos.size > 0) throw new Error(`Ids repetidos: ${[...repetidos].join(", ")}.`)
}

/** Printed before any call: batches, and US$ from list prices (the system prompt and the user message, per batch). */
export function estimarClasificacion(entrada: { elementos: readonly ElementoPorClasificar[]; sistema: string }): {
  tandas: number
  usd: number
} {
  let caracteres = 0
  let tandas = 0
  for (let desde = 0; desde < entrada.elementos.length; desde += POR_TANDA) {
    tandas += 1
    caracteres +=
      entrada.sistema.length + pedidoDeReclasificacion(entrada.elementos.slice(desde, desde + POR_TANDA)).length
  }
  const usd = costoClaude(
    {
      input_tokens: Math.ceil(caracteres / CARACTERES_POR_TOKEN),
      output_tokens: TOKENS_DE_SALIDA_POR_ELEMENTO * entrada.elementos.length,
    },
    MODELO_POR_TAREA.clasificarEnPilares.modelo,
  )
  return { tandas, usd: Number(usd.toFixed(4)) }
}
