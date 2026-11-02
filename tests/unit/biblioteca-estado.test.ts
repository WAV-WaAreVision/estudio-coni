import { describe, expect, it } from "vitest"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import {
  esperaConfirmacion,
  estaProcesando,
  presentarEstado,
  sePuedeReintentar,
  tieneMotivo,
} from "@/lib/dominio/biblioteca/estado"

const base = { estado: "procesando", motivo_fallo: null, costo_estimado_usd: null, costo_confirmado_en: null }

describe("the state of a material", () => {
  it("waits for her OK while a long material has an estimate and no confirmation", () => {
    expect(esperaConfirmacion({ ...base, costo_estimado_usd: 1.2 })).toBe(true)
    expect(esperaConfirmacion({ ...base, costo_estimado_usd: 1.2, costo_confirmado_en: "2026-11-02T12:00:00Z" })).toBe(
      false,
    )
  })

  it("can be retried when it failed or was paused with a reason, never while it waits for her OK", () => {
    expect(sePuedeReintentar({ ...base, estado: "fallido", motivo_fallo: "sin_texto" })).toBe(true)
    expect(sePuedeReintentar({ ...base, motivo_fallo: "tope_mensual" })).toBe(true)
    expect(sePuedeReintentar(base)).toBe(false)
    expect(sePuedeReintentar({ ...base, costo_estimado_usd: 1.2, motivo_fallo: "x" })).toBe(false)
  })

  it("is really working only while it processes without a reason", () => {
    expect(estaProcesando(base)).toBe(true)
    expect(estaProcesando({ ...base, motivo_fallo: "tope_mensual" })).toBe(false)
    expect(estaProcesando({ ...base, estado: "listo" })).toBe(false)
  })
})

describe("tieneMotivo: a blank reason is no reason, in the state and in the detail for WAV alike", () => {
  it("needs some text once trimmed", () => {
    expect(tieneMotivo("tope_mensual")).toBe(true)
    expect(tieneMotivo(null)).toBe(false)
    expect(tieneMotivo("")).toBe(false)
    expect(tieneMotivo("   ")).toBe(false)
  })

  it.each(["", "  "])("treats a material processing with the reason %j as processing", (motivo) => {
    const material = { ...base, motivo_fallo: motivo }
    expect(estaProcesando(material)).toBe(true)
    expect(sePuedeReintentar(material)).toBe(false)
    expect(presentarEstado(material)).toEqual({ palabra: "Procesando", tipo: "neutro", icono: "reloj" })
    expect(lineasParaWav({ ...material, id: "m", autor_id: "a", rol: "referente" }, {})).not.toContainEqual(
      expect.stringMatching(/^Motivo:/),
    )
  })
})

describe("presentarEstado (4j: always a word and an icon, never only a colour)", () => {
  it.each([
    [
      { ...base, estado: "listo" },
      { palabra: "Listo", tipo: "ok", icono: null },
    ],
    [
      { ...base, estado: "fallido", motivo_fallo: "sin_texto" },
      { palabra: "Con error", tipo: "error", icono: null },
    ],
    [base, { palabra: "Procesando", tipo: "neutro", icono: "reloj" }],
    [
      { ...base, motivo_fallo: "tope_mensual" },
      { palabra: "En pausa", tipo: "aviso", icono: "pausa" },
    ],
    [
      { ...base, costo_estimado_usd: 1.2 },
      { palabra: "Espera tu OK", tipo: "aviso", icono: "mano" },
    ],
  ])("says %j as %j", (material, visible) => {
    expect(presentarEstado(material)).toEqual(visible)
  })

  it("says an unknown state as it comes", () => {
    expect(presentarEstado({ ...base, estado: "raro" })).toEqual({ palabra: "raro", tipo: "neutro", icono: null })
  })
})
