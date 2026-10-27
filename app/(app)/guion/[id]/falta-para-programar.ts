import { SIN_HORARIO } from "../../video/[id]/falta-para-firmar"

export type FaltaParaProgramar =
  | { tipo: "nada" }
  | { tipo: "bloqueo"; texto: string }
  | { tipo: "falta"; cosas: string[] }

/** What keeps a carousel's gate 2 closed: no free time blocks; otherwise she has to have seen every slide. */
export function faltaParaProgramarCarrusel(estado: { vioTodas: boolean; hayFecha: boolean }): FaltaParaProgramar {
  if (!estado.hayFecha) return { tipo: "bloqueo", texto: SIN_HORARIO }
  return estado.vioTodas ? { tipo: "nada" } : { tipo: "falta", cosas: ["ver todas las láminas"] }
}
