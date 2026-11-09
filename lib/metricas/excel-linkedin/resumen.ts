import type { OpcionDelExcel } from "./cruzar"
import { TOPE_POR_LISTA } from "./leer"

// Every sentence Coni reads about the import, decided here so it is tested without a browser.

/** 2 MB: LinkedIn's export weighs tens of KB. Below Next's 2mb body limit, which also carries the form's overhead. */
export const TAMANO_MAXIMO = 2_000_000

export const COMO_DESCARGARLO = [
  "En LinkedIn, abre Estadísticas y luego Contenido.",
  "Toca Exportar, elige los últimos 30 días y sube aquí el archivo.",
] as const

export const ERROR_NO_ES_EL_EXCEL = `Este no es el Excel de estadísticas de LinkedIn en español. ${COMO_DESCARGARLO.join(" ")}`
export const ERROR_MUY_GRANDE =
  "Ese archivo pesa más de 2 MB. El Excel de LinkedIn pesa mucho menos: revisa que sea ese."

const numero = (valor: number) => valor.toLocaleString("es-CL")
const publicaciones = (cantidad: number) => `${numero(cantidad)} ${cantidad === 1 ? "publicación" : "publicaciones"}`

export interface DatosDelResumen {
  /** Post rows the database wrote. */
  guardadas: number
  seguidores: number | null
  ajenas: number
  faltanEnElPeriodo: number
  llegoAlTope: boolean
  /** Hand uploads waiting for her pick. */
  dudosos: number
}

export function resumenDeImportacion(datos: DatosDelResumen): string[] {
  const lineas: string[] = []
  if (datos.guardadas > 0) {
    lineas.push(`Listo: ${publicaciones(datos.guardadas)} con números.`)
    if (datos.seguidores !== null) lineas.push(`También guardé tus seguidores: ${numero(datos.seguidores)}.`)
  } else if (datos.dudosos === 0) {
    lineas.push(
      datos.seguidores === null
        ? "En ese período no hay publicaciones de Conidolly. No guardé nada."
        : `En ese período no hay publicaciones de Conidolly: guardé solo tus seguidores (${numero(datos.seguidores)}).`,
    )
  }
  if (datos.ajenas > 0) {
    lineas.push(
      datos.ajenas === 1
        ? "Ignoré 1 publicación del Excel que no salió de Conidolly."
        : `Ignoré ${numero(datos.ajenas)} publicaciones del Excel que no salieron de Conidolly.`,
    )
  }
  if (datos.faltanEnElPeriodo > 0 && datos.llegoAlTope) {
    const faltan =
      datos.faltanEnElPeriodo === 1 ? "Falta 1 publicación" : `Faltan ${publicaciones(datos.faltanEnElPeriodo)}`
    lineas.push(
      `${faltan} de Conidolly: el Excel trae hasta ${TOPE_POR_LISTA} por lista. Descarga un período más corto (30 o 90 días) y súbelo de nuevo.`,
    )
  }
  if (datos.dudosos > 0) {
    lineas.push(
      datos.dudosos === 1
        ? "Falta que elijas a qué post del Excel corresponde 1 publicación subida a mano."
        : `Falta que elijas a qué post del Excel corresponden ${publicaciones(datos.dudosos)} subidas a mano.`,
    )
  }
  return lineas
}

export function resumenDeDudosos(guardadas: number): string[] {
  return [`Listo: ${publicaciones(guardadas)} más con números.`]
}

/** "2026-10-07" is "miércoles 7 de octubre". Noon UTC keeps the calendar day whatever the zone. */
export function diaEnPalabras(dia: string): string {
  const texto = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dia}T12:00:00Z`))
  return texto.replace(",", "")
}

export function etiquetaDeOpcion(opcion: OpcionDelExcel): string {
  const partes = [opcion.fecha ? diaEnPalabras(opcion.fecha) : "Sin fecha"]
  if (opcion.impresiones !== null) {
    partes.push(`${numero(opcion.impresiones)} ${opcion.impresiones === 1 ? "impresión" : "impresiones"}`)
  }
  if (opcion.interacciones !== null) {
    partes.push(`${numero(opcion.interacciones)} ${opcion.interacciones === 1 ? "interacción" : "interacciones"}`)
  }
  return partes.join(" · ")
}
