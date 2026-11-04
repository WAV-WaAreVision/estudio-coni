import { etiquetaDeTipoDeAutor } from "./modelo"

export interface AutorDeLista {
  id: string
  nombre: string
  credencial: string | null
  tipo: string
  alias: string[]
}

const LARGO_MINIMO_PARA_SUGERIR = 3

/** Lowercase, without accents and with single spaces: how two spellings of a name are compared. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

const nombresDe = (autor: AutorDeLista) => [autor.nombre, ...autor.alias].map(normalizar)

/** The authors whose name or alias contains what was typed; with nothing typed, all of them in the order given. */
export function buscarAutores<T extends AutorDeLista>(autores: T[], texto: string): T[] {
  const buscado = normalizar(texto)
  if (buscado === "") return autores
  return autores.filter((autor) => nombresDe(autor).some((nombre) => nombre.includes(buscado)))
}

/**
 * The authors a new name may be the same person as: the name or an alias is the typed one, or one contains the other.
 * Very short text suggests nobody: two letters match half the list.
 */
export function autoresParecidos(autores: AutorDeLista[], nombre: string): AutorDeLista[] {
  const tipeado = normalizar(nombre)
  if (tipeado.length < LARGO_MINIMO_PARA_SUGERIR) return []
  return autores.filter((autor) =>
    nombresDe(autor).some(
      (existente) =>
        existente.length >= LARGO_MINIMO_PARA_SUGERIR && (existente.includes(tipeado) || tipeado.includes(existente)),
    ),
  )
}

/** The longest name or credential a new author takes: the picker's `maxLength` and the action's `AutorNuevo`. */
export const LARGO_DE_AUTOR_NUEVO = 200

export const RUTA_DE_AUTORES = "/biblioteca/autores"
export const hrefDeAutor = (id: string) => `${RUTA_DE_AUTORES}/${id}`

/** Autores with the desktop side panel open on `seleccion` (`?a=<id>`, D4). */
export function hrefDeAutores(seleccion: string | null = null): string {
  return seleccion ? `${RUTA_DE_AUTORES}?a=${seleccion}` : RUTA_DE_AUTORES
}

/** "Persona · investigadora de confianza", or just the kind. */
export function descripcionDeAutor(autor: Pick<AutorDeLista, "tipo" | "credencial">): string {
  return [etiquetaDeTipoDeAutor(autor.tipo), autor.credencial].filter(Boolean).join(" · ")
}

/** Joining makes the author of the page disappear: never Coni's own card. */
export const sePuedeUnir = (autor: Pick<AutorDeLista, "tipo">) => autor.tipo !== "coni"

export const TEMAS_POR_AUTOR = 3

export interface TemaContado {
  id: string
  nombre: string
  ideas: number
}

export interface AutorResumido extends AutorDeLista {
  materiales: number
  /** Visible ideas only: the hidden ones are the author's page's business. */
  ideas: number
  temas: TemaContado[]
}

export interface IdeaDeAutor {
  autorId: string
  temaId: string | null
  tema: string
}

const masIdeasPrimero = (a: { ideas: number; nombre: string }, b: { ideas: number; nombre: string }) =>
  b.ideas - a.ideas || a.nombre.localeCompare(b.nombre, "es")

/**
 * Ported from Ingesta's `resumirAutores` (D2): how much each author gave and the topics it speaks of most. The order is
 * the spec's (D3): most ideas first, then name.
 */
export function armarResumenDeAutores(
  autores: readonly AutorDeLista[],
  materiales: readonly { autorId: string }[],
  ideas: readonly IdeaDeAutor[],
): AutorResumido[] {
  const materialesPorAutor = new Map<string, number>()
  for (const { autorId } of materiales) materialesPorAutor.set(autorId, (materialesPorAutor.get(autorId) ?? 0) + 1)
  const porAutor = new Map<string, { total: number; temas: Map<string, TemaContado> }>()
  for (const idea of ideas) {
    const delAutor = porAutor.get(idea.autorId) ?? { total: 0, temas: new Map<string, TemaContado>() }
    delAutor.total += 1
    // A topic row the reader could not join has a blank name: it would show as an empty chip.
    if (idea.temaId !== null && idea.tema.trim() !== "") {
      const tema = delAutor.temas.get(idea.temaId) ?? { id: idea.temaId, nombre: idea.tema, ideas: 0 }
      tema.ideas += 1
      delAutor.temas.set(idea.temaId, tema)
    }
    porAutor.set(idea.autorId, delAutor)
  }
  return autores
    .map((autor) => ({
      ...autor,
      materiales: materialesPorAutor.get(autor.id) ?? 0,
      ideas: porAutor.get(autor.id)?.total ?? 0,
      temas: [...(porAutor.get(autor.id)?.temas.values() ?? [])].sort(masIdeasPrimero).slice(0, TEMAS_POR_AUTOR),
    }))
    .sort(masIdeasPrimero)
}
