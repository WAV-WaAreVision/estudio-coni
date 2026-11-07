import { describe, expect, it } from "vitest"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import {
  avisoDeProceso,
  estaProcesando,
  marcadoConMotivo,
  presentarEstado,
  sePuedeReintentar,
} from "@/lib/dominio/biblioteca/estado"

const base = { estado: "procesando", motivo_fallo: null, costo_estimado_usd: null }

describe("the state of a material", () => {
  it("treats a processing material with an estimate as working, never as waiting (batch 6)", () => {
    const conEstimado = { ...base, costo_estimado_usd: 1.2 }
    expect(estaProcesando(conEstimado)).toBe(true)
    expect(sePuedeReintentar(conEstimado)).toBe(false)
    expect(presentarEstado(conEstimado)).toEqual({ palabra: "Procesando", tipo: "neutro", icono: "reloj" })
  })

  it("can be retried when it failed or was paused with a reason, an old waiting one too (D6)", () => {
    expect(sePuedeReintentar({ ...base, estado: "fallido", motivo_fallo: "sin_texto" })).toBe(true)
    expect(sePuedeReintentar({ ...base, motivo_fallo: "tope_mensual" })).toBe(true)
    expect(sePuedeReintentar(base)).toBe(false)
    const viejo = { ...base, costo_estimado_usd: 1.2, motivo_fallo: "Este material es largo." }
    expect(sePuedeReintentar(viejo)).toBe(true)
    expect(presentarEstado(viejo)).toEqual({ palabra: "En pausa", tipo: "aviso", icono: "pausa" })
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
