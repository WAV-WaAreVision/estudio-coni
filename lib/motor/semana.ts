import { diaLocal } from "@/lib/dominio/fechas"

const ZONA = "America/Santiago"
const MS_POR_DIA = 86_400_000

/** The Sunday that closes the Monday to Sunday week of `fecha` in Santiago, as `2026-10-11`. It keys `motor_corridas.semana`. */
export function semanaDe(fecha: Date): string {
  const hoy = diaLocal(fecha.getTime(), ZONA)
  const mediodia = Date.parse(`${hoy}T12:00:00Z`)
  const diasHastaElDomingo = (7 - new Date(mediodia).getUTCDay()) % 7
  return new Date(mediodia + diasHastaElDomingo * MS_POR_DIA).toISOString().slice(0, 10)
}
