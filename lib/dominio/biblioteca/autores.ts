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
export function buscarAutores(autores: AutorDeLista[], texto: string): AutorDeLista[] {
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
