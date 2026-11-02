// Ported from `armarMapa` of Ingesta's lib/ingesta/materiales.ts.

export interface MapaDelMaterial {
  total: number
  /** The topics its ideas belong to, the most ideas first. */
  temas: { id: string; nombre: string; afirmaciones: number }[]
  sinTema: number
  tipos: Record<string, number>
  evidencia: Record<string, number>
}

export interface FilaDeAfirmacion {
  tema_id: string | null
  tipo: string
  evidencia: string
  temas: { nombre: string } | null
}

const sumar = (cuentas: Record<string, number>, clave: string) => {
  cuentas[clave] = (cuentas[clave] ?? 0) + 1
}

/** Counts the ideas of one material by topic, by type and by kind of evidence. */
export function armarMapa(filas: FilaDeAfirmacion[]): MapaDelMaterial {
  const temas = new Map<string, { id: string; nombre: string; afirmaciones: number }>()
  const mapa: MapaDelMaterial = { total: filas.length, temas: [], sinTema: 0, tipos: {}, evidencia: {} }
  for (const fila of filas) {
    sumar(mapa.tipos, fila.tipo)
    sumar(mapa.evidencia, fila.evidencia)
    if (fila.tema_id === null) {
      mapa.sinTema += 1
      continue
    }
    const tema = temas.get(fila.tema_id) ?? { id: fila.tema_id, nombre: fila.temas?.nombre ?? "", afirmaciones: 0 }
    tema.afirmaciones += 1
    temas.set(fila.tema_id, tema)
  }
  mapa.temas = [...temas.values()].sort(
    (a, b) => b.afirmaciones - a.afirmaciones || a.nombre.localeCompare(b.nombre, "es"),
  )
  return mapa
}

/** Counts as rows, the most frequent first, each with its word (or its code when it has none). */
export function masFrecuentesPrimero(
  cuentas: Record<string, number>,
  etiquetas: Record<string, string>,
): { clave: string; texto: string; cantidad: number }[] {
  return Object.entries(cuentas)
    .sort(([claveA, a], [claveB, b]) => b - a || claveA.localeCompare(claveB))
    .map(([clave, cantidad]) => ({ clave, texto: etiquetas[clave] ?? clave, cantidad }))
}
