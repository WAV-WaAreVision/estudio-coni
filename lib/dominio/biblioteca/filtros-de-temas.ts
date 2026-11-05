import { z } from "zod"
import { hrefDeAutor } from "./autores"

export const RUTA_DE_TEMAS = "/biblioteca/temas"
export const hrefDeTema = (id: string) => `${RUTA_DE_TEMAS}/${id}`

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

export const AVISO_TRAS_OCULTAR = "La oculté. La puedes volver a mostrar desde su autor."
export const AVISO_TRAS_OCULTAR_LA_ULTIMA =
  "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor."

/**
 * Where Ocultar goes (D6). The hidden idea leaves its topic, and a topic left without ideas is deleted by the database
 * (`recalcular_tema`), so the last one goes to the list. The count is the topic's ideas before hiding; the idea's id
 * makes each address new.
 */
export function hrefTrasOcultar(temaId: string, ideaId: string, ideasAntesDeOcultar: number): string {
  return ideasAntesDeOcultar > 1 ? `${hrefDeTema(temaId)}?oculta=${ideaId}` : `${RUTA_DE_TEMAS}?oculta=${ideaId}`
}

// A path inside the Biblioteca and a plain query: no scheme, host, dot, backslash, percent or doubled slash passes.
const DESTINO_DE_LA_BIBLIOTECA = /^\/biblioteca(?:\/[A-Za-z0-9_-]+)+(?:\?[A-Za-z0-9_=&-]*)?$/

/**
 * Where the server goes after Ocultar or Mostrar. The address comes from the client, so only one of the Biblioteca's
 * own is kept; anything else lands on the Temas list, never on another site.
 */
export function destinoTrasOcultar(destino: unknown): string {
  return typeof destino === "string" && DESTINO_DE_LA_BIBLIOTECA.test(destino) ? destino : RUTA_DE_TEMAS
}

/** The idea just hidden (`?oculta=<id>`), so the page says its note; anything else is no note. */
export function leerIdeaOculta(params: Params): string | null {
  const leida = z.uuid().safeParse(primero(params.oculta)?.trim())
  return leida.success ? leida.data : null
}

export const AVISO_TRAS_MOSTRAR = "La volví a mostrar. Está en «Sin tema todavía»."

/**
 * Where Mostrar goes: back to the author, with the idea in the address so the page says its note. Shown again, the idea
 * has no topic until the next maintenance run places it (deviation 2).
 */
export const hrefTrasMostrar = (autorId: string, ideaId: string) => `${hrefDeAutor(autorId)}?mostrada=${ideaId}`

/** The idea just shown again (`?mostrada=<id>`); anything else is no note. */
export function leerIdeaMostrada(params: Params): string | null {
  const leida = z.uuid().safeParse(primero(params.mostrada)?.trim())
  return leida.success ? leida.data : null
}
