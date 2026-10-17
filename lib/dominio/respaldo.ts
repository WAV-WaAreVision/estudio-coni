import { type Fuente, fuentesCitadas } from "@/lib/dominio/fuente"

/** One claim behind the theory of an engine idea, as the piece stores it. */
export interface AfirmacionDeRespaldo {
  id: string
  /** Neutral paraphrase (ours, not the source's). */
  texto: string
  /** Verbatim fragment of the source, in its original language. */
  cita: string
  aporte: string
  autor: string
  /** Coni's own words (`autores.tipo = 'coni'`): hers to repeat, never a copy. */
  deConi: boolean
  /** The author is a person (`autores.tipo = 'persona'`), as opposed to an account or an institution. */
  esPersona: boolean
  /** Absent on backings stored before sources existed. */
  fuente?: Fuente
}

/** What the script was written from: frozen on the piece when the draft is written. */
export interface Respaldo {
  teoria: { id: string; titulo: string; tesis: string; porQue: string }
  afirmaciones: AfirmacionDeRespaldo[]
}

/** Bounds the prompt: about 3 000 input tokens at most. */
export const MAXIMO_AFIRMACIONES_DE_RESPALDO = 12

const porId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const deEvidencia = (a: { evidencia: string }) => (a.evidencia === "estudio" || a.evidencia === "clinica" ? 0 : 1)

/**
 * The claims a backing keeps, as `respaldo_de_idea` picks them (20261017000110): studies and clinical practice first,
 * then by id, up to the cap; returned by id. Whoever shows a source without that function (the idea card) uses this,
 * so the card and the script name the same sources.
 */
export function afirmacionesDelRespaldo<A extends { id: string; evidencia: string }>(
  afirmaciones: readonly A[],
  limite = MAXIMO_AFIRMACIONES_DE_RESPALDO,
): A[] {
  return afirmaciones
    .toSorted((a, b) => deEvidencia(a) - deEvidencia(b) || porId(a, b))
    .slice(0, limite)
    .toSorted(porId)
}

/** Canonical form for the gate-1 hash: fixed field order, claims by id. No backing is the empty string. */
export function huellaDeRespaldo(respaldo: Respaldo | null): string {
  if (respaldo === null) return ""
  const { teoria } = respaldo
  const afirmaciones = [...respaldo.afirmaciones].sort(porId).map((a) => {
    const base = [a.id, a.texto, a.cita, a.aporte, a.autor, a.deConi, a.esPersona]
    // Only when present, so a backing stored before sources hashes exactly as before (amendment 12).
    return a.fuente === undefined ? base : [...base, a.fuente.autor, a.fuente.titulo, a.fuente.anio]
  })
  return JSON.stringify([teoria.id, teoria.titulo, teoria.tesis, teoria.porQue, afirmaciones])
}

/** What the copy check looks for: quotes and names of third parties only. */
export function ajenoDelRespaldo(respaldo: Respaldo | null): {
  citas: string[]
  autores: string[]
  personas: string[]
  citadas: string[]
  titulosCitados: string[]
} {
  const ajenas = respaldo?.afirmaciones.filter((a) => !a.deConi) ?? []
  const citadas = fuentesCitadas(respaldo?.afirmaciones ?? [])
  return {
    citas: ajenas.map((a) => a.cita),
    autores: [...new Set(ajenas.map((a) => a.autor))],
    personas: [...new Set(ajenas.filter((a) => a.esPersona).map((a) => a.autor))],
    citadas: citadas.map((f) => f.autor),
    titulosCitados: [...new Set(citadas.flatMap((f) => (f.titulo === null ? [] : [f.titulo])))],
  }
}

/** What the writer sees: no ids and no author names, so it has nothing to cite. */
export function paraElGuion(respaldo: Respaldo) {
  const { titulo, tesis, porQue } = respaldo.teoria
  return {
    teoria: { titulo, tesis, porQue },
    afirmaciones: respaldo.afirmaciones.map(({ texto, cita, aporte }) => ({ texto, cita, aporte })),
  }
}
