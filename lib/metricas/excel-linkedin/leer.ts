import { leerCifra } from "@/lib/metricas/linkedin"

// The export LinkedIn gives from its content analytics, in Spanish (issue 15, comment of 2026-11-09). Pure: it gets the
// rows already read as text, so every case is tested without a binary file.

/** Text rows per sheet name. */
export type HojasDelExcel = ReadonlyMap<string, readonly (readonly string[])[]>

export type TipoDePost = "share" | "ugcPost"

export interface PostDelExcel {
  tipo: TipoDePost
  /** The number of the post's URN, as text: it has 19 digits, past what a JavaScript number keeps exactly. */
  numero: string
  /** `AAAA-MM-DD`, or null when LinkedIn wrote something else. */
  fecha: string | null
  impresiones: number | null
  interacciones: number | null
}

export interface ExcelDeLinkedin {
  periodo: { desde: string; hasta: string }
  publicaciones: PostDelExcel[]
  seguidores: number | null
  /** One of the two rankings is full: a post past the 50th is missing from the file. */
  llegoAlTope: boolean
  /** Rows whose URL names no share or ugcPost: not a post Conidolly could have published. */
  sinIdentificar: number
}

export type ErrorDelExcel = "no_es_el_excel" | "otro_idioma" | "periodo_ilegible"

export type LecturaDelExcel = { ok: true; excel: ExcelDeLinkedin } | { ok: false; error: ErrorDelExcel }

export const TOPE_POR_LISTA = 50

type Filas = readonly (readonly string[])[]

const HOJA_DEL_PERIODO = "DESCUBRIMIENTO"
const HOJA_DE_PUBLICACIONES = "PUBLICACIONES PRINCIPALES"
const HOJA_DE_SEGUIDORES = "SEGUIDORES"
/** The same export with LinkedIn in English: refused with the same words, told apart in the log. */
const HOJAS_EN_INGLES = ["DISCOVERY", "TOP POSTS", "FOLLOWERS"]
const COLUMNA_URL = "URL de la publicación"
const COLUMNA_FECHA = "Fecha de publicación"
/** The headers are on row 3 today; a note more or less above them should not break the import. */
const FILAS_ANTES_DEL_ENCABEZADO = 5

const FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const PERIODO = /^(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})$/
const TOTAL_DE_SEGUIDORES = /^Total de seguidores el \d{1,2}\/\d{1,2}\/\d{4}$/
const POST_EN_URL = /-(share|ugcPost)-(\d+)-/

/** "9/11/2026" (no leading zeros) is "2026-11-09"; anything that is not a real day is null. */
export function leerFecha(texto: string): string | null {
  const partes = FECHA.exec(texto.trim())
  if (!partes) return null
  const dia = Number(partes[1])
  const mes = Number(partes[2])
  const anio = Number(partes[3])
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null
  return fecha.toISOString().slice(0, 10)
}

/** "1200" or "1.200"; a figure LinkedIn wrote some other way is unknown, not zero. */
function cifra(texto: string): number | null {
  const leida = leerCifra(texto)
  return leida === "invalida" ? null : leida
}

function celda(filas: Filas, fila: number, columna: number): string {
  return filas[fila]?.[columna]?.trim() ?? ""
}

function leerPeriodo(filas: Filas): { desde: string; hasta: string } | null {
  for (const texto of filas[0] ?? []) {
    const partes = PERIODO.exec(texto.trim())
    if (!partes) continue
    const desde = leerFecha(partes[1] ?? "")
    const hasta = leerFecha(partes[2] ?? "")
    if (desde && hasta && desde <= hasta) return { desde, hasta }
  }
  return null
}

function leerSeguidores(filas: Filas | undefined): number | null {
  const primera = filas?.[0] ?? []
  const indice = primera.findIndex((texto) => TOTAL_DE_SEGUIDORES.test(texto.trim()))
  return indice === -1 ? null : cifra(primera[indice + 1] ?? "")
}

interface Columnas {
  url: number
  fecha: number
  cifra: number
}

/** The two rankings sit side by side (interactions in A-C, impressions in E-G): found by their headers. */
function columnasDe(encabezado: readonly string[], titulo: string): Columnas | null {
  const columna = encabezado.findIndex((texto) => texto.trim() === titulo)
  if (columna < 2) return null
  if (encabezado[columna - 2]?.trim() !== COLUMNA_URL || encabezado[columna - 1]?.trim() !== COLUMNA_FECHA) return null
  return { url: columna - 2, fecha: columna - 1, cifra: columna }
}

export function leerExcelDeLinkedin(hojas: HojasDelExcel): LecturaDelExcel {
  const delPeriodo = hojas.get(HOJA_DEL_PERIODO)
  const deLasPublicaciones = hojas.get(HOJA_DE_PUBLICACIONES)
  if (!delPeriodo || !deLasPublicaciones) {
    return { ok: false, error: HOJAS_EN_INGLES.some((hoja) => hojas.has(hoja)) ? "otro_idioma" : "no_es_el_excel" }
  }
  const periodo = leerPeriodo(delPeriodo)
  if (!periodo) return { ok: false, error: "periodo_ilegible" }

  const filaDelEncabezado = deLasPublicaciones
    .slice(0, FILAS_ANTES_DEL_ENCABEZADO)
    .findIndex((fila) => fila.some((texto) => texto.trim() === COLUMNA_URL))
  const encabezado = deLasPublicaciones[filaDelEncabezado] ?? []
  const listas = [
    ["interacciones", columnasDe(encabezado, "Interacciones")],
    ["impresiones", columnasDe(encabezado, "Impresiones")],
  ] as const
  const posts = new Map<string, PostDelExcel>()
  const sinIdentificar = new Set<string>()
  let llegoAlTope = false
  for (const [campo, columnas] of listas) {
    if (filaDelEncabezado === -1 || !columnas) return { ok: false, error: "no_es_el_excel" }
    let largo = 0
    for (let fila = filaDelEncabezado + 1; fila < deLasPublicaciones.length; fila++) {
      const url = celda(deLasPublicaciones, fila, columnas.url)
      if (url === "") continue
      largo += 1
      const identificado = POST_EN_URL.exec(url)
      if (!identificado) {
        sinIdentificar.add(url)
        continue
      }
      const tipo: TipoDePost = identificado[1] === "share" ? "share" : "ugcPost"
      const numero = identificado[2] ?? ""
      const clave = `${tipo}:${numero}`
      const post = posts.get(clave) ?? { tipo, numero, fecha: null, impresiones: null, interacciones: null }
      post.fecha ??= leerFecha(celda(deLasPublicaciones, fila, columnas.fecha))
      post[campo] = cifra(celda(deLasPublicaciones, fila, columnas.cifra))
      posts.set(clave, post)
    }
    if (largo >= TOPE_POR_LISTA) llegoAlTope = true
  }
  return {
    ok: true,
    excel: {
      periodo,
      publicaciones: [...posts.values()],
      seguidores: leerSeguidores(hojas.get(HOJA_DE_SEGUIDORES)),
      llegoAlTope,
      sinIdentificar: sinIdentificar.size,
    },
  }
}
