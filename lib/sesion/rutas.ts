export const RUTA_DE_INGRESO = "/ingreso"

/** The Biblioteca tab (batch 7 of change 29b): the Biblioteca lives in the app. */
export const RUTA_DE_LA_BIBLIOTECA = "/biblioteca"

export type DecisionDeRuta = "seguir" | "a_ingreso" | "a_inicio"

/** The optimistic check of `proxy.ts`: the real authorisation is Coni's row in `miembros`, checked on the server. */
export function decidirRuta(entrada: { ruta: string; haySesion: boolean }): DecisionDeRuta {
  const enIngreso = entrada.ruta === RUTA_DE_INGRESO || entrada.ruta.startsWith(`${RUTA_DE_INGRESO}/`)
  if (!entrada.haySesion) return enIngreso ? "seguir" : "a_ingreso"
  return enIngreso ? "a_inicio" : "seguir"
}
