import { diaLocal } from "@/lib/dominio/fechas"

/** Dates are stored in UTC and shown in Chile (CLAUDE.md). */
export const ZONA_DE_LA_BIBLIOTECA = "America/Santiago"

const UN_DIA_MS = 24 * 60 * 60 * 1000

/** Midnight UTC of a calendar day `2026-10-31`: subtracting two of them counts calendar days, DST aside. */
const inicioDelDia = (dia: string) => Date.parse(`${dia}T00:00:00Z`)

/** When a material was uploaded, in calendar days of `zona` (D7): Hoy, Ayer, Hace N días, then the date. */
export function subidoHace(instante: string, ahora: number, zona: string): string {
  const ms = Date.parse(instante)
  if (Number.isNaN(ms)) throw new Error(`Instante ilegible: ${instante}`)
  const dia = diaLocal(ms, zona)
  const hoy = diaLocal(ahora, zona)
  const dias = Math.round((inicioDelDia(hoy) - inicioDelDia(dia)) / UN_DIA_MS)
  if (dias <= 0) return "Hoy"
  if (dias === 1) return "Ayer"
  if (dias < 7) return `Hace ${dias} días`
  const mismoAnio = dia.slice(0, 4) === hoy.slice(0, 4)
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: zona,
    day: "numeric",
    month: "long",
    ...(mismoAnio ? {} : { year: "numeric" }),
  }).format(ms)
}

/** The same, inside a sentence: "subido hoy", "subido hace 2 días", "subido el 20 de octubre". */
export function subidoEnFrase(instante: string, ahora: number, zona: string): string {
  const texto = subidoHace(instante, ahora, zona)
  return /^\d/.test(texto) ? `subido el ${texto}` : `subido ${texto.toLowerCase()}`
}
