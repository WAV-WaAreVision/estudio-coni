export type FaltaParaProgramar = { tipo: "nada" } | { tipo: "falta"; cosas: string[] }

/** What keeps a carousel's gate 2 closed: seeing every slide and choosing the date. */
export function faltaParaProgramarCarrusel(estado: { vioTodas: boolean; hayFecha: boolean }): FaltaParaProgramar {
  const cosas = [estado.vioTodas ? null : "ver todas las láminas", estado.hayFecha ? null : "elegir la fecha"].filter(
    (cosa): cosa is string => cosa !== null,
  )
  return cosas.length === 0 ? { tipo: "nada" } : { tipo: "falta", cosas }
}
