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
}

/** What the script was written from: frozen on the piece when the draft is written. */
export interface Respaldo {
  teoria: { id: string; titulo: string; tesis: string; porQue: string }
  afirmaciones: AfirmacionDeRespaldo[]
}

/** Bounds the prompt: about 3 000 input tokens at most. */
export const MAXIMO_AFIRMACIONES_DE_RESPALDO = 12

const porId = (a: AfirmacionDeRespaldo, b: AfirmacionDeRespaldo) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Canonical form for the gate-1 hash: fixed field order, claims by id. No backing is the empty string. */
export function huellaDeRespaldo(respaldo: Respaldo | null): string {
  if (respaldo === null) return ""
  const { teoria } = respaldo
  const afirmaciones = [...respaldo.afirmaciones]
    .sort(porId)
    .map((a) => [a.id, a.texto, a.cita, a.aporte, a.autor, a.deConi])
  return JSON.stringify([teoria.id, teoria.titulo, teoria.tesis, teoria.porQue, afirmaciones])
}

/** What the copy check looks for: quotes and names of third parties only. */
export function ajenoDelRespaldo(respaldo: Respaldo | null): { citas: string[]; autores: string[] } {
  const ajenas = respaldo?.afirmaciones.filter((a) => !a.deConi) ?? []
  return { citas: ajenas.map((a) => a.cita), autores: [...new Set(ajenas.map((a) => a.autor))] }
}

/** What the writer sees: no ids and no author names, so it has nothing to cite. */
export function paraElGuion(respaldo: Respaldo) {
  const { titulo, tesis, porQue } = respaldo.teoria
  return {
    teoria: { titulo, tesis, porQue },
    afirmaciones: respaldo.afirmaciones.map(({ texto, cita, aporte }) => ({ texto, cita, aporte })),
  }
}
