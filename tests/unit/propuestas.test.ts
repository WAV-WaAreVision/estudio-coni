import { describe, expect, it } from "vitest"
import {
  conLaPropuestaPrimero,
  espacioLibreParaCambiar,
  huecosLibres,
  ocupadasEnLaPuerta,
  type PiezaConFechas,
  propuestasVivas,
  propuestaVigente,
  repartir,
  textoDePropuestas,
  textoPorRepartir,
} from "@/lib/calendario/propuestas"

// Thursday 15 Oct 2026, 12:00 in Santiago (UTC-3). Slots Tue, Thu, Sat at 19:00 = 22:00 UTC: 15, 17, 20, 22, 24, 27...
const AHORA = Date.parse("2026-10-15T15:00:00.000Z")
const HORARIO = { dias: [2, 4, 6], hora: "19:00", zona: "America/Santiago" }
const alas19 = (dia: number) => `2026-10-${String(dia).padStart(2, "0")}T22:00:00.000Z`

let n = 0
function pieza(extra: Partial<PiezaConFechas>): PiezaConFechas {
  n += 1
  return {
    id: `p${n}`,
    estado: "guion_por_aprobar",
    creadaEn: `2026-10-0${n % 9 || 1}T12:00:00.000Z`,
    publicarEn: null,
    fechaPropuesta: null,
    ...extra,
  }
}

const lugares = (piezas: PiezaConFechas[]) =>
  repartir({ piezas, horario: HORARIO, ahora: AHORA }).map((l) => [l.piezaId, l.instante, l.guardada])

describe("repartir", () => {
  it("gives the next free slots to the unsigned pieces, the closest to publishing first, then the oldest", () => {
    const escribiendose = pieza({ id: "e", estado: "guion_en_proceso", creadaEn: "2026-10-12T12:00:00.000Z" })
    const video = pieza({ id: "v", estado: "video_por_aprobar", creadaEn: "2026-10-14T12:00:00.000Z" })
    const guion = pieza({ id: "g", estado: "guion_por_aprobar", creadaEn: "2026-10-13T12:00:00.000Z" })
    const programada = pieza({ id: "x", estado: "programado", publicarEn: alas19(15) })

    expect(lugares([escribiendose, video, guion, programada])).toEqual([
      ["v", alas19(17), false],
      ["g", alas19(20), false],
      ["e", alas19(22), false],
    ])
  })

  it("keeps a stored proposal that is still free and gives the others the slots around it", () => {
    const video = pieza({ id: "v", estado: "video_por_aprobar", fechaPropuesta: alas19(22) })
    const guion = pieza({ id: "g", estado: "guion_por_aprobar" })

    expect(lugares([video, guion])).toEqual([
      ["v", alas19(22), true],
      ["g", alas19(15), false],
    ])
  })

  it("ignores a stored proposal a signed piece took, and one too close or in the past", () => {
    const tomada = pieza({ id: "t", fechaPropuesta: alas19(17), creadaEn: "2026-10-01T12:00:00.000Z" })
    const pasada = pieza({ id: "p", fechaPropuesta: alas19(13), creadaEn: "2026-10-02T12:00:00.000Z" })
    const programada = pieza({ id: "x", estado: "programado", publicarEn: alas19(17) })

    expect(lugares([tomada, pasada, programada])).toEqual([
      ["t", alas19(15), false],
      ["p", alas19(20), false],
    ])
  })

  it("never gives a slot twice: of two stored proposals on one slot, the first in order keeps it", () => {
    const primera = pieza({ id: "a", estado: "video_por_aprobar", fechaPropuesta: alas19(20) })
    const segunda = pieza({ id: "b", estado: "guion_por_aprobar", fechaPropuesta: alas19(20) })

    expect(lugares([segunda, primera])).toEqual([
      ["a", alas19(20), true],
      ["b", alas19(15), false],
    ])
  })

  it("leaves scheduled and published pieces alone", () => {
    expect(
      lugares([
        pieza({ estado: "programado", publicarEn: alas19(15) }),
        pieza({ estado: "publicado", publicarEn: alas19(13) }),
        pieza({ estado: "publicado_a_mano", publicarEn: alas19(13) }),
        pieza({ estado: "para_subir_a_mano", publicarEn: alas19(13) }),
        pieza({ estado: "descartado" }),
      ]),
    ).toEqual([])
  })
})

describe("propuestaVigente", () => {
  const tomadas = new Set([Date.parse(alas19(17))])
  it("holds while it is ahead by the margin and no signed piece has its time", () => {
    expect(propuestaVigente(alas19(20), { ahora: AHORA, tomadas, antelacionMs: 3_600_000 })).toBe(alas19(20))
    expect(propuestaVigente(alas19(17), { ahora: AHORA, tomadas, antelacionMs: 3_600_000 })).toBeNull()
    expect(propuestaVigente(alas19(15), { ahora: AHORA, tomadas, antelacionMs: 12 * 3_600_000 })).toBeNull()
    expect(propuestaVigente(null, { ahora: AHORA, tomadas, antelacionMs: 0 })).toBeNull()
  })
})

describe("huecosLibres and espacioLibreParaCambiar", () => {
  const video = pieza({ id: "v", estado: "video_por_aprobar", fechaPropuesta: alas19(22) })
  const guion = pieza({ id: "g", estado: "guion_por_aprobar" })
  const piezas = [video, guion]

  it("offers the slots no piece holds, signed, stored or only shown", () => {
    expect(huecosLibres({ piezas, horario: HORARIO, ahora: AHORA, cuantas: 3, contar: "todos" })).toEqual([
      alas19(17),
      alas19(20),
      alas19(24),
    ])
  })

  it("accepts a change into a slot only a shown placement holds, or into its own, but not a stored one", () => {
    const base = { piezas, horario: HORARIO, ahora: AHORA }
    expect(espacioLibreParaCambiar({ ...base, piezaId: "v", instante: alas19(15) })).toBe(true)
    expect(espacioLibreParaCambiar({ ...base, piezaId: "v", instante: alas19(22) })).toBe(true)
    expect(espacioLibreParaCambiar({ ...base, piezaId: "g", instante: alas19(22) })).toBe(false)
    expect(espacioLibreParaCambiar({ ...base, piezaId: "g", instante: "2026-10-16T21:30:00.000Z" })).toBe(false)
  })
})

describe("conLaPropuestaPrimero", () => {
  it("puts a live proposal first so gate 2 preselects it, and leaves the list alone without one", () => {
    expect(conLaPropuestaPrimero(["a", "b", "c", "d"], "c", 4)).toEqual(["c", "a", "b", "d"])
    expect(conLaPropuestaPrimero(["a", "b", "c", "d"], "z", 4)).toEqual(["z", "a", "b", "c"])
    expect(conLaPropuestaPrimero(["a", "b"], null, 4)).toEqual(["a", "b"])
  })
})

describe("Agenda copy", () => {
  it("counts the pieces without a proposal and what Repartir stored", () => {
    expect(textoPorRepartir(1)).toBe("1 pieza en camino sin fecha propuesta.")
    expect(textoPorRepartir(3)).toBe("3 piezas en camino sin fecha propuesta.")
    expect(textoDePropuestas(1)).toBe("Propuse fecha para 1 pieza. Puedes cambiarla.")
    expect(textoDePropuestas(2)).toBe("Propuse fecha para 2 piezas. Puedes cambiarlas.")
    expect(textoDePropuestas(0)).toBe("Todas tus piezas ya tienen fecha propuesta.")
  })
})

describe("propuestasVivas", () => {
  it("keeps the other pieces' proposals that still hold their time at the Agenda's margin", () => {
    const tomadas = new Set([Date.parse(alas19(20))])
    expect(
      propuestasVivas([alas19(22), alas19(20), alas19(15), "2026-10-15T16:00:00.000Z"], { ahora: AHORA, tomadas }),
    ).toEqual([alas19(22), alas19(15)])
  })
})

describe("ocupadasEnLaPuerta", () => {
  it("adds the other pieces' live proposals to the signed times a gate keeps free", () => {
    expect(
      ocupadasEnLaPuerta({ ocupadas: [alas19(17)], otrasPropuestas: [alas19(20), alas19(17), alas19(13)] }, AHORA),
    ).toEqual([alas19(17), alas19(20)])
  })
})
