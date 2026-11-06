import { z } from "zod"
import { RUTA_DE_AUTORES } from "./autores"
import { RUTA_DE_MATERIALES } from "./filtros"

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

export type LoBorrado = "material" | "autor"

const LISTA_TRAS_BORRAR: Record<LoBorrado, string> = { material: RUTA_DE_MATERIALES, autor: RUTA_DE_AUTORES }

/** The list a deletion lands on, with the note that names what went (spec, «Notice on the next screen»). */
export function hrefTrasBorrar(tipo: LoBorrado, id: string): string {
  return `${LISTA_TRAS_BORRAR[tipo]}?aviso=borrado&id=${id}`
}

/** The id of what was just deleted when the address carries the deletion's note; anything else is no note. */
export function leerBorrado(params: Params): string | null {
  if (primero(params.aviso)?.trim() !== "borrado") return null
  const leido = z.uuid().safeParse(primero(params.id)?.trim())
  return leido.success ? leido.data : null
}

export function avisoTrasBorrar(nombre: string | null): string {
  return nombre ? `Borré «${nombre}».` : "Lo borré."
}

export const LO_RECUPERE = "Lo recuperé."
export const NO_PUDE_BORRAR = "No pude borrarlo. Prueba de nuevo."
export const NO_PUDE_RECUPERAR = "No pude recuperarlo. Prueba de nuevo."
export const YA_NO_SE_RECUPERA = "Ya no se puede recuperar: se borró del todo."
export const AUTOR_CON_MATERIALES = "Este autor todavía tiene materiales."
export const CONI_NO_SE_BORRA = "Tu propia ficha no se puede borrar."

/** As `marcar_autor_para_borrar` refuses: never Coni's card, nothing live by or from the author. */
export function sePuedeBorrarAutor(
  autor: { tipo: string },
  cuenta: { materiales: number; ideas: number; ocultas: number },
): boolean {
  return autor.tipo !== "coni" && cuenta.materiales === 0 && cuenta.ideas === 0 && cuenta.ocultas === 0
}
