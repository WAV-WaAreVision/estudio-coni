// tests/unit/diseno-revision.test.ts
import { describe, expect, it } from "vitest"
import { cifraDeRevision, revisarPendientes } from "@/lib/diseno/revision"
import type { Hallazgo } from "@/lib/dominio/revision"

const FRASE: Hallazgo = { regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "Verifica.", frase: "la mayoría" }
const PUNTO: Hallazgo = { regla: "tema_de_riesgo", tipo: "advierte", mensaje: "Sexualidad." }
const BLOQUEA: Hallazgo = { regla: "cierre", tipo: "bloquea", mensaje: "Falta el cierre." }

describe("cifraDeRevision", () => {
  it("says nothing without findings and 'Revisado' once nothing is pending", () => {
    expect(cifraDeRevision([], 0, new Set())).toBeNull()
    expect(cifraDeRevision([], 2, new Set())).toBe("Revisado")
  })

  it("talks about phrases when every pending finding has its phrase marked in the reading", () => {
    const OTRA: Hallazgo = { ...FRASE, frase: "siempre" }
    expect(cifraDeRevision([FRASE], 1, new Set([FRASE]))).toBe("1 frase marcada")
    expect(cifraDeRevision([FRASE, OTRA], 3, new Set([FRASE, OTRA]))).toBe("2 frases marcadas")
  })

  it("counts what is left when a pending phrase is only quoted in its panel, not marked", () => {
    const CRUZA: Hallazgo = { ...FRASE, frase: "la [warm] mayoría" }
    expect(cifraDeRevision([CRUZA], 1, new Set())).toBe("1 por revisar")
    expect(cifraDeRevision([FRASE, CRUZA], 2, new Set([FRASE]))).toBe("2 por revisar")
  })

  it("counts what is left otherwise", () => {
    expect(cifraDeRevision([FRASE, PUNTO], 2, new Set([FRASE]))).toBe("2 por revisar")
    expect(cifraDeRevision([BLOQUEA], 1, new Set())).toBe("1 por revisar")
  })
})

describe("revisarPendientes", () => {
  it("says nothing when every warning was ticked", () => {
    expect(revisarPendientes([])).toBeNull()
  })

  it("asks to review phrases, or warnings when one quotes none", () => {
    expect(revisarPendientes([FRASE])).toBe("revisar 1 frase")
    expect(revisarPendientes([FRASE, FRASE])).toBe("revisar 2 frases")
    expect(revisarPendientes([PUNTO])).toBe("revisar 1 aviso")
    expect(revisarPendientes([FRASE, PUNTO])).toBe("revisar 2 avisos")
  })
})
