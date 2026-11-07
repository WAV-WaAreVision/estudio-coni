import { describe, expect, it } from "vitest"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import {
  avisoDeProceso,
  esperaConfirmacion,
  estaProcesando,
  marcadoConMotivo,
  presentarEstado,
  sePuedeReintentar,
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

describe("marcadoConMotivo: as the database decides (reintentar_material, marcar_disparo_fallido)", () => {
  it("counts any reason that is not null, a blank one included", () => {
    expect(marcadoConMotivo("tope_mensual")).toBe(true)
    expect(marcadoConMotivo("")).toBe(true)
    expect(marcadoConMotivo("   ")).toBe(true)
    expect(marcadoConMotivo(null)).toBe(false)
  })

  it.each(["", "  "])("treats a material processing with the reason %j as paused and retryable", (motivo) => {
    const material = { ...base, motivo_fallo: motivo }
    expect(estaProcesando(material)).toBe(false)
    expect(sePuedeReintentar(material)).toBe(true)
    expect(presentarEstado(material)).toEqual({ palabra: "En pausa", tipo: "aviso", icono: "pausa" })
    expect(lineasParaWav({ ...material, id: "m", autor_id: "a", rol: "referente" }, {})).toContain(
      "Motivo: sin detalle",
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

describe("avisoDeProceso (spec decision 3)", () => {
  it("says what it will cost once the task wrote the estimate, two decimals in Chilean Spanish", () => {
    expect(avisoDeProceso({ ...base, costo_estimado_usd: 0.4 })).toBe("Lo estoy procesando. Costará cerca de US$ 0,40.")
    expect(avisoDeProceso({ ...base, costo_estimado_usd: 1.2345 })).toBe(
      "Lo estoy procesando. Costará cerca de US$ 1,23.",
    )
  })

  it("says only «Lo estoy procesando.» before the extraction ends", () => {
    expect(avisoDeProceso(base)).toBe("Lo estoy procesando.")
  })

  it("says nothing when it is not working: paused with a reason, ready or failed", () => {
    expect(avisoDeProceso({ ...base, costo_estimado_usd: 0.4, motivo_fallo: "tope_mensual" })).toBeNull()
    expect(avisoDeProceso({ ...base, costo_estimado_usd: 0.4, estado: "listo" })).toBeNull()
    expect(avisoDeProceso({ ...base, estado: "fallido", motivo_fallo: "sin_texto" })).toBeNull()
  })
})
