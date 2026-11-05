import { esRed, NOMBRE_DE_RED, type Red } from "@/lib/dominio/pilares"
import { RED_POR_DEFECTO } from "./fila-de-temas"
import { RUTA_DE_TEMAS } from "./filtros-de-temas"

/** A pillar draft (spec 2026-11-05, part 15c): what Coni wrote, waiting for her approval. */
export interface BorradorDePilar {
  id: string
  red: Red
  nombre: string
  nombreCorto: string
  descripcion: string
  peso: number
}

/** A network draft: only her idea; WAV builds the network and reads it by SQL. */
export interface BorradorDeRed {
  id: string
  nombre: string
  manual: string
  receta: string
  conexion: string
}

export type BorradorLeido = { tipo: "pilar"; borrador: BorradorDePilar } | { tipo: "red"; borrador: BorradorDeRed }

/** The database's checks (20261105000100) repeat these. */
export const LARGOS = {
  nombre: 120,
  nombreCorto: 40,
  descripcion: 1500,
  nombreDeRed: 60,
  notaDeRed: 4000,
} as const

export const ESPERANDO_CONEXION = "Esperando conexión"

export const RUTA_DE_BORRADORES = `${RUTA_DE_TEMAS}/borradores`
export const RUTA_DE_RED_NUEVA = `${RUTA_DE_TEMAS}/red-nueva`
export const hrefDePilarNuevo = (red: Red) => `${RUTA_DE_TEMAS}/pilar-nuevo?red=${red}`
/** Both kinds: ids are uuids, so the page finds which one it is. */
export const hrefDeEditarBorrador = (id: string) => `${RUTA_DE_BORRADORES}/${id}/editar`
export const hrefDeAprobarBorrador = (id: string) => `${RUTA_DE_BORRADORES}/${id}/aprobar`

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)?.trim()

/** The network of «+ Agregar pilar»: from the address, else the last one she used in Temas, else LinkedIn. */
export function leerRedPedida(params: Params, ultimaRed: Red | null): Red {
  const pedida = primero(params.red)
  return esRed(pedida) ? pedida : (ultimaRed ?? RED_POR_DEFECTO)
}

export const CLAVES_DE_AVISO = [
  "borrador-guardado",
  "red-guardada",
  "borrador-editado",
  "borrador-descartado",
  "pilar-aprobado",
] as const
export type Aviso = (typeof CLAVES_DE_AVISO)[number]

/** The note a draft's form leaves on the page it returns to (`AvisoDeIdeas`, said once by `TrasElAviso`). */
export const AVISOS: Record<Aviso, string> = {
  "borrador-guardado": "Guardé el borrador. Apruébalo en Borradores cuando quieras.",
  "red-guardada": "Guardé el borrador de la red. Queda en Borradores, esperando conexión.",
  "borrador-editado": "Guardé los cambios del borrador.",
  "borrador-descartado": "Descarté el borrador.",
  "pilar-aprobado": "Aprobé el pilar. Ya aparece en Temas.",
}

export function leerAviso(params: Params): string | null {
  const pedido = primero(params.aviso)
  const aviso = CLAVES_DE_AVISO.find((clave) => clave === pedido)
  return aviso ? AVISOS[aviso] : null
}

export function conAviso(href: string, aviso: Aviso): string {
  return `${href}${href.includes("?") ? "&" : "?"}aviso=${aviso}`
}

const PESO = /^\d{1,3}(?:[.,]\d{1,2})?$/

/** "15", "12,5" or "12.5": a weight over 0 and up to 100, two decimals at most; anything else is null. */
export function leerPeso(texto: string): number | null {
  const limpio = texto.trim()
  if (!PESO.test(limpio)) return null
  const peso = Number(limpio.replace(",", "."))
  return peso > 0 && peso <= 100 ? peso : null
}

/** 110 is "110", 12.5 is "12,5": as she writes it. */
export const formatoDePeso = (peso: number) =>
  peso.toLocaleString("es-CL", { maximumFractionDigits: 2, useGrouping: false })

export type Armado<T, C extends string> = { ok: true; datos: T } | { ok: false; error: string; campo: C }

const muyLargo = (que: string, largo: number) => `${que} puede tener hasta ${largo} caracteres.`

export interface CamposDePilar {
  nombre: string
  nombreCorto: string
  descripcion: string
  peso: string
}
export type CampoDePilar = keyof CamposDePilar
export type BorradorDePilarArmado = Omit<BorradorDePilar, "id" | "red">

export const CAMPOS_DE_PILAR_VACIOS: CamposDePilar = { nombre: "", nombreCorto: "", descripcion: "", peso: "" }

export const ERRORES_DE_PILAR: Record<CampoDePilar, string> = {
  nombre: "Escribe el nombre del pilar.",
  nombreCorto: "Escribe el nombre corto: es el texto del botón en Temas.",
  descripcion: "Escribe la definición del pilar.",
  peso: "Escribe el peso como un número mayor que 0 y hasta 100, por ejemplo 15 o 12,5.",
}

/** The pillar form, checked in her words before anything is sent; the first field that fails is named. */
export function armarBorradorDePilar(campos: CamposDePilar): Armado<BorradorDePilarArmado, CampoDePilar> {
  const nombre = campos.nombre.trim()
  const nombreCorto = campos.nombreCorto.trim()
  const descripcion = campos.descripcion.trim()
  if (nombre === "") return { ok: false, error: ERRORES_DE_PILAR.nombre, campo: "nombre" }
  if (nombre.length > LARGOS.nombre) return { ok: false, error: muyLargo("El nombre", LARGOS.nombre), campo: "nombre" }
  if (nombreCorto === "") return { ok: false, error: ERRORES_DE_PILAR.nombreCorto, campo: "nombreCorto" }
  if (nombreCorto.length > LARGOS.nombreCorto) {
    return { ok: false, error: muyLargo("El nombre corto", LARGOS.nombreCorto), campo: "nombreCorto" }
  }
  if (descripcion === "") return { ok: false, error: ERRORES_DE_PILAR.descripcion, campo: "descripcion" }
  if (descripcion.length > LARGOS.descripcion) {
    return { ok: false, error: muyLargo("La definición", LARGOS.descripcion), campo: "descripcion" }
  }
  const peso = leerPeso(campos.peso)
  if (peso === null) return { ok: false, error: ERRORES_DE_PILAR.peso, campo: "peso" }
  return { ok: true, datos: { nombre, nombreCorto, descripcion, peso } }
}

export function camposDeBorradorDePilar(borrador: BorradorDePilar): CamposDePilar {
  return {
    nombre: borrador.nombre,
    nombreCorto: borrador.nombreCorto,
    descripcion: borrador.descripcion,
    peso: formatoDePeso(borrador.peso),
  }
}

export interface CamposDeRed {
  nombre: string
  manual: string
  receta: string
  conexion: string
}
export type CampoDeRed = keyof CamposDeRed
export type BorradorDeRedArmado = Omit<BorradorDeRed, "id">

export const CAMPOS_DE_RED_VACIOS: CamposDeRed = { nombre: "", manual: "", receta: "", conexion: "" }
export const FALTA_NOMBRE_DE_RED = "Escribe el nombre de la red."

const NOTAS_DE_RED = [
  ["manual", "El manual"],
  ["receta", "La receta"],
  ["conexion", "La conexión"],
] as const

/** The network form: a name, and three notes that may stay empty. */
export function armarBorradorDeRed(campos: CamposDeRed): Armado<BorradorDeRedArmado, CampoDeRed> {
  const datos = {
    nombre: campos.nombre.trim(),
    manual: campos.manual.trim(),
    receta: campos.receta.trim(),
    conexion: campos.conexion.trim(),
  }
  if (datos.nombre === "") return { ok: false, error: FALTA_NOMBRE_DE_RED, campo: "nombre" }
  if (datos.nombre.length > LARGOS.nombreDeRed) {
    return { ok: false, error: muyLargo("El nombre", LARGOS.nombreDeRed), campo: "nombre" }
  }
  for (const [campo, que] of NOTAS_DE_RED) {
    if (datos[campo].length > LARGOS.notaDeRed) return { ok: false, error: muyLargo(que, LARGOS.notaDeRed), campo }
  }
  return { ok: true, datos }
}

export function camposDeBorradorDeRed(borrador: BorradorDeRed): CamposDeRed {
  return { nombre: borrador.nombre, manual: borrador.manual, receta: borrador.receta, conexion: borrador.conexion }
}

/** The key of the new pillar's weight in a stage of `p_pesos`; every other key is a pillar id. */
export const NUEVO = "nuevo"

/** One weight of the approval screen, as she types it. */
export interface FilaDePeso {
  clave: string
  nombre: string
  peso: string
}

/** One stage of the approval screen (decision 8): «Hoy» or a later date, with every weight of that date. */
export interface EtapaEditable {
  desde: string
  esHoy: boolean
  etiqueta: string
  filas: FilaDePeso[]
}

const fechaLarga = (desde: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(
    Date.parse(`${desde}T12:00:00Z`),
  )

/** «Hoy», or «Desde el 1 de enero de 2027». */
export const etiquetaDeEtapa = (desde: string, hoy: string) => (desde === hoy ? "Hoy" : `Desde el ${fechaLarga(desde)}`)

/** The network's stages (`etapasDeRed`), each with its pillars and, last, the new one at the draft's weight. */
export function etapasDeAprobacion(
  borrador: BorradorDePilar,
  etapas: readonly { desde: string; pesos: readonly { id: string; nombreCorto: string; peso: number }[] }[],
  hoy: string,
): EtapaEditable[] {
  return etapas.map((etapa) => ({
    desde: etapa.desde,
    esHoy: etapa.desde === hoy,
    etiqueta: etiquetaDeEtapa(etapa.desde, hoy),
    filas: [
      ...etapa.pesos.map((pilar) => ({ clave: pilar.id, nombre: pilar.nombreCorto, peso: formatoDePeso(pilar.peso) })),
      { clave: NUEVO, nombre: borrador.nombreCorto, peso: formatoDePeso(borrador.peso) },
    ],
  }))
}

/** A stage's live total; null while a weight cannot be read, so the screen says which one instead. */
export function totalDePesos(filas: readonly FilaDePeso[]): number | null {
  let total = 0
  for (const fila of filas) {
    const peso = leerPeso(fila.peso)
    if (peso === null) return null
    total += peso
  }
  return Math.round(total * 100) / 100
}

/** Spec 15c: a stage whose total is not 100 warns and never blocks. */
export function avisoDePesos(red: Red, total: number, etapa: Pick<EtapaEditable, "desde" | "esHoy">): string | null {
  if (total === 100) return null
  const cuando = etapa.esHoy ? "" : ` desde el ${fechaLarga(etapa.desde)}`
  return `Los pesos de ${NOMBRE_DE_RED[red]}${cuando} suman ${formatoDePeso(total)} %. Puedes aprobar igual y ajustarlos después.`
}

/** `p_pesos` of `aprobar_borrador_de_pilar`: `{desde: {pilar_id | "nuevo": peso}}`; the first unreadable weight is named. */
export function armarPesos(
  etapas: readonly EtapaEditable[],
):
  | { ok: true; pesos: Record<string, Record<string, number>> }
  | { ok: false; error: string; desde: string; clave: string } {
  const pesos: Record<string, Record<string, number>> = {}
  for (const etapa of etapas) {
    const deLaEtapa: Record<string, number> = {}
    for (const fila of etapa.filas) {
      const peso = leerPeso(fila.peso)
      if (peso === null) {
        return {
          ok: false,
          error: `Escribe el peso de ${fila.nombre} (${etapa.etiqueta}) como un número mayor que 0 y hasta 100.`,
          desde: etapa.desde,
          clave: fila.clave,
        }
      }
      deLaEtapa[fila.clave] = peso
    }
    pesos[etapa.desde] = deLaEtapa
  }
  return { ok: true, pesos }
}

export const AVISO_DE_LA_GUIA = "La guía editorial no se actualiza sola: agrega a mano el texto de este pilar."
