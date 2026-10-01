// Port of Python's difflib.SequenceMatcher(None, a, b, autojunk=False): no junk and no "popular"
// elements. coni.py aligns subtitles with it, so ratio() and get_opcodes() must match exactly,
// including how ties between equally long matches are broken.

export type Etiqueta = "equal" | "replace" | "delete" | "insert"
export type Opcode = [Etiqueta, number, number, number, number]
type Bloque = [number, number, number]
type Tramo = [number, number, number, number]

export function compararSecuencias(a: readonly string[], b: readonly string[]): { ratio: number; opcodes: Opcode[] } {
  const bloques = bloquesIguales(a, b)
  const iguales = bloques.reduce((suma, bloque) => suma + bloque[2], 0)
  const total = a.length + b.length
  return { ratio: total ? (2 * iguales) / total : 1, opcodes: opcodesDe(bloques) }
}

function indicesEnB(b: readonly string[]): Map<string, number[]> {
  const indices = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const lista = indices.get(b[j])
    if (lista) {
      lista.push(j)
    } else {
      indices.set(b[j], [j])
    }
  }
  return indices
}

function coincidenciaMasLarga(
  a: readonly string[],
  b: readonly string[],
  indices: Map<string, number[]>,
  [alo, ahi, blo, bhi]: Tramo,
): Bloque {
  let mejorI = alo
  let mejorJ = blo
  let mejorK = 0
  let largoEn = new Map<number, number>()
  for (let i = alo; i < ahi; i++) {
    const nuevo = new Map<number, number>()
    for (const j of indices.get(a[i]) ?? []) {
      if (j < blo) continue
      if (j >= bhi) break
      const k = (largoEn.get(j - 1) ?? 0) + 1
      nuevo.set(j, k)
      if (k > mejorK) {
        mejorI = i - k + 1
        mejorJ = j - k + 1
        mejorK = k
      }
    }
    largoEn = nuevo
  }
  // difflib extends the match over equal neighbours afterwards. Without junk these loops never move
  // anything, but they are kept so the port reads line-for-line against the Python source.
  while (mejorI > alo && mejorJ > blo && a[mejorI - 1] === b[mejorJ - 1]) {
    mejorI--
    mejorJ--
    mejorK++
  }
  while (mejorI + mejorK < ahi && mejorJ + mejorK < bhi && a[mejorI + mejorK] === b[mejorJ + mejorK]) {
    mejorK++
  }
  return [mejorI, mejorJ, mejorK]
}

function bloquesIguales(a: readonly string[], b: readonly string[]): Bloque[] {
  const indices = indicesEnB(b)
  const cola: Tramo[] = [[0, a.length, 0, b.length]]
  const bloques: Bloque[] = []
  for (let tramo = cola.pop(); tramo; tramo = cola.pop()) {
    const [alo, ahi, blo, bhi] = tramo
    const [i, j, k] = coincidenciaMasLarga(a, b, indices, tramo)
    if (k) {
      bloques.push([i, j, k])
      if (alo < i && blo < j) cola.push([alo, i, blo, j])
      if (i + k < ahi && j + k < bhi) cola.push([i + k, ahi, j + k, bhi])
    }
  }
  bloques.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])

  const unidos: Bloque[] = []
  let [i1, j1, k1] = [0, 0, 0]
  for (const [i2, j2, k2] of bloques) {
    if (i1 + k1 === i2 && j1 + k1 === j2) {
      k1 += k2
    } else {
      if (k1) unidos.push([i1, j1, k1])
      ;[i1, j1, k1] = [i2, j2, k2]
    }
  }
  if (k1) unidos.push([i1, j1, k1])
  unidos.push([a.length, b.length, 0])
  return unidos
}

function opcodesDe(bloques: Bloque[]): Opcode[] {
  const opcodes: Opcode[] = []
  let i = 0
  let j = 0
  for (const [ai, bj, k] of bloques) {
    let etiqueta: Etiqueta | null = null
    if (i < ai && j < bj) {
      etiqueta = "replace"
    } else if (i < ai) {
      etiqueta = "delete"
    } else if (j < bj) {
      etiqueta = "insert"
    }
    if (etiqueta) opcodes.push([etiqueta, i, ai, j, bj])
    i = ai + k
    j = bj + k
    if (k) opcodes.push(["equal", ai, i, bj, j])
  }
  return opcodes
}
