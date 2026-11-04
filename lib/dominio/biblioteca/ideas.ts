// Ported from the grouping inside Ingesta's `leerAutor` and `leerTema` (lib/ingesta/autores.ts, temas.ts), pure (D2).

/** What the detail pages show of an idea: her words, and what goes to "Detalle para WAV". */
export interface IdeaLeida {
  id: string
  texto: string
  tipo: string
  evidencia: string
}

interface ConFecha {
  id: string
  creadaEn: string
}

/** Oldest first, then by id. The readers page by id (keyset), so the reading order is set here. */
function enOrden<T extends ConFecha>(filas: readonly T[]): T[] {
  return filas.toSorted((a, b) => a.creadaEn.localeCompare(b.creadaEn) || a.id.localeCompare(b.id))
}

const comoIdea = ({ id, texto, tipo, evidencia }: IdeaLeida): IdeaLeida => ({ id, texto, tipo, evidencia })

export interface FilaDeIdeaDeAutor extends IdeaLeida, ConFecha {
  excluida: boolean
  temaId: string | null
  /** The topic's name; blank when the topic could not be joined. */
  tema: string
}

export interface GrupoPorTema {
  tema: { id: string; nombre: string } | null
  ideas: IdeaLeida[]
}

/** An author's ideas by topic (D3), and apart the hidden ones, which only its page shows again. */
export function agruparPorTema(filas: readonly FilaDeIdeaDeAutor[]): { grupos: GrupoPorTema[]; ocultas: IdeaLeida[] } {
  const grupos = new Map<string | null, GrupoPorTema>()
  const ocultas: IdeaLeida[] = []
  for (const fila of enOrden(filas)) {
    if (fila.excluida) {
      ocultas.push(comoIdea(fila))
      continue
    }
    const temaId = fila.temaId !== null && fila.tema.trim() !== "" ? fila.temaId : null
    const grupo = grupos.get(temaId) ?? { tema: temaId === null ? null : { id: temaId, nombre: fila.tema }, ideas: [] }
    grupo.ideas.push(comoIdea(fila))
    grupos.set(temaId, grupo)
  }
  return {
    grupos: [...grupos.values()].sort(
      (a, b) =>
        Number(a.tema === null) - Number(b.tema === null) ||
        b.ideas.length - a.ideas.length ||
        (a.tema?.nombre ?? "").localeCompare(b.tema?.nombre ?? "", "es"),
    ),
    ocultas,
  }
}

export interface FilaDeIdeaDeTema extends IdeaLeida, ConFecha {
  autorId: string
  autor: string
  credencial: string | null
}

export interface GrupoPorAutor {
  autor: { id: string; nombre: string; credencial: string | null }
  ideas: IdeaLeida[]
}

/** A topic's ideas by author, the author with most ideas first, then by name (D3). */
export function agruparPorAutor(filas: readonly FilaDeIdeaDeTema[]): GrupoPorAutor[] {
  const grupos = new Map<string, GrupoPorAutor>()
  for (const fila of enOrden(filas)) {
    const grupo = grupos.get(fila.autorId) ?? {
      autor: { id: fila.autorId, nombre: fila.autor, credencial: fila.credencial },
      ideas: [],
    }
    grupo.ideas.push(comoIdea(fila))
    grupos.set(fila.autorId, grupo)
  }
  return [...grupos.values()].sort(
    (a, b) => b.ideas.length - a.ideas.length || a.autor.nombre.localeCompare(b.autor.nombre, "es"),
  )
}
