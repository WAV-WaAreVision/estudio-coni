import { describe, expect, it } from "vitest"
import { type Pieza, piezaNueva } from "@/lib/dominio/estados"
import { claveIdempotencia, puedeArmar, puedeEntregarseParaSubir, puedePublicar } from "@/lib/dominio/puertas"

const HASH = "a".repeat(64)
const CARRUSEL = "11111111-1111-4111-8111-111111111111"
const PUBLICAR_EN = "2026-10-29T22:00:00.000Z"

const armando: Pieza = {
  ...piezaNueva("carrusel"),
  estado: "armando_carrusel",
  puerta1: { hash: HASH, en: "2026-10-27T12:00:00.000Z" },
}
const programado: Pieza = {
  ...armando,
  estado: "programado",
  puerta2: { carruselId: CARRUSEL, hashTexto: HASH, publicarEn: PUBLICAR_EN, en: "2026-10-27T13:00:00.000Z" },
}

describe("puedeArmar", () => {
  it("lets the render go on the signed words only", () => {
    expect(puedeArmar(armando, HASH)).toEqual({ ok: true })
    expect(puedeArmar(armando, "b".repeat(64))).toEqual({ ok: false, motivo: "artefacto_cambio" })
    expect(puedeArmar({ ...armando, puerta1: null }, HASH)).toEqual({ ok: false, motivo: "sin_aprobacion" })
    expect(puedeArmar({ ...armando, estado: "carrusel_por_aprobar" }, HASH)).toEqual({ ok: false, motivo: "estado" })
    expect(puedeArmar({ ...armando, tipo: "reel" }, HASH)).toEqual({ ok: false, motivo: "estado" })
  })
})

describe("a scheduled carousel", () => {
  it("is handed over at its time when its version and words are the approved ones", () => {
    const ahora = "2026-10-29T22:01:00.000Z"
    expect(puedeEntregarseParaSubir(programado, { hashTexto: HASH, carruselId: CARRUSEL, ahora })).toEqual({ ok: true })
    expect(puedeEntregarseParaSubir(programado, { hashTexto: HASH, carruselId: "otro", ahora })).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
    expect(puedeEntregarseParaSubir(programado, { hashTexto: HASH, ahora })).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
  })

  it("is never published by the API path in part 2", () => {
    expect(puedePublicar(programado, { hashTexto: HASH, ahora: "2026-10-29T22:01:00.000Z" })).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
  })

  it("has its own idempotency step", () => {
    expect(claveIdempotencia({ piezaId: "p", paso: "armar", hash: HASH, intento: 2 })).toBe(
      "p:armar:aaaaaaaaaaaaaaaa:2",
    )
  })
})
