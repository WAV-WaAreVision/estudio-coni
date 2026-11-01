import { diaLocal } from "@/lib/dominio/fechas"
import { diaAntes, unAnioDespues } from "./fechas"

/** Spec, yearly review: Coni and WAV hear about it this many days before it is due. */
export const DIAS_DE_AVISO_DE_REVISION = 30

/** The day the next review is due: a year after her latest «Lo revisé», or after the register started. */
export function venceLaRevision(entrada: { ultima: string | null; desde: string; zona: string }): string {
  const base = entrada.ultima === null ? entrada.desde : diaLocal(Date.parse(entrada.ultima), entrada.zona)
  return unAnioDespues(base)
}

/** From 30 days before the due date, once per due date. Days are `2027-11-15`, so text order is date order. */
export function revisionPorAvisar(entrada: { vence: string; avisada: string | null; hoy: string }): boolean {
  return entrada.avisada !== entrada.vence && entrada.hoy >= diaAntes(entrada.vence, DIAS_DE_AVISO_DE_REVISION)
}
