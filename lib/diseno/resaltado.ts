import { partirEnMarcas } from "@/lib/dominio/etiquetas"

export type TrozoDeLectura =
  | { tipo: "texto" | "marca"; valor: string }
  | { tipo: "frase"; valor: string; indice: number }

interface Rango {
  desde: number
  hasta: number
  indice: number
}

/**
 * The script cut for reading (decision 9): tone marks apart, and each finding's phrase marked at its first occurrence.
 * A phrase that is absent, whose first occurrence crosses a tone mark or overlaps an earlier mark stays unmarked; its
 * review panel quotes it instead. `resaltadas` holds the indexes of `frases` that were marked. Joined back, the pieces
 * are the script, character for character.
 */
export function resaltarFrases(
  guion: string,
  frases: readonly (string | null)[],
): { trozos: TrozoDeLectura[]; resaltadas: ReadonlySet<number> } {
  const partes = partirEnMarcas(guion)
  const textos: { desde: number; hasta: number }[] = []
  let posicion = 0
  for (const parte of partes) {
    if (parte.tipo === "texto") textos.push({ desde: posicion, hasta: posicion + parte.valor.length })
    posicion += parte.valor.length
  }

  const rangos: Rango[] = []
  for (const [indice, frase] of frases.entries()) {
    if (!frase) continue
    const desde = guion.indexOf(frase)
    if (desde < 0) continue
    const hasta = desde + frase.length
    const enUnTexto = textos.some((texto) => texto.desde <= desde && hasta <= texto.hasta)
    const pisaOtra = rangos.some((rango) => desde < rango.hasta && rango.desde < hasta)
    if (enUnTexto && !pisaOtra) rangos.push({ desde, hasta, indice })
  }
  rangos.sort((a, b) => a.desde - b.desde)

  const trozos: TrozoDeLectura[] = []
  posicion = 0
  for (const parte of partes) {
    const inicio = posicion
    const fin = posicion + parte.valor.length
    posicion = fin
    if (parte.tipo === "marca") {
      trozos.push(parte)
      continue
    }
    let cursor = inicio
    for (const rango of rangos) {
      if (rango.desde < inicio || rango.hasta > fin) continue
      if (rango.desde > cursor) trozos.push({ tipo: "texto", valor: guion.slice(cursor, rango.desde) })
      trozos.push({ tipo: "frase", valor: guion.slice(rango.desde, rango.hasta), indice: rango.indice })
      cursor = rango.hasta
    }
    if (cursor < fin) trozos.push({ tipo: "texto", valor: guion.slice(cursor, fin) })
  }
  return { trozos, resaltadas: new Set(rangos.map((rango) => rango.indice)) }
}
