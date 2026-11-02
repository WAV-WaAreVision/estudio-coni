// @vitest-environment node
import { describe, expect, it } from "vitest"
import { type FilaDeGasto, resultadoDeReserva } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

const GASTO: FilaDeGasto = {
  id: 1,
  pieza_id: null,
  proveedor: "anthropic",
  paso: "guion",
  mes: "2026-11-01",
  estimado_usd: 0.5,
  real_usd: null,
  estado: "reservado",
  clave: "clave-1",
  creado_en: "2026-11-02T12:00:00Z",
  sin_cobro: false,
  reservado_por: null,
}

describe("resultadoDeReserva", () => {
  it("reads the hard limit with what the month used and the limit", () => {
    expect(
      resultadoDeReserva({ message: "limite_alcanzado", details: "usado=79.5000;estimado=0.5;limite=80.00" }, null),
    ).toEqual({ limite: true, usadoUsd: 79.5, limiteUsd: 80 })
  })

  it("reads the old cap error the same way, so the deploy window never breaks a run", () => {
    expect(
      resultadoDeReserva({ message: "tope_alcanzado", details: "usado=35.0000 estimado=10 tope=40.00" }, null),
    ).toEqual({ limite: true, usadoUsd: 35, limiteUsd: 40 })
  })

  it("still stops when the detail is missing", () => {
    expect(resultadoDeReserva({ message: "limite_alcanzado" }, null)).toEqual({
      limite: true,
      usadoUsd: null,
      limiteUsd: null,
    })
  })

  it("gives null figures for a garbled detail instead of NaN", () => {
    expect(resultadoDeReserva({ message: "limite_alcanzado", details: "usado=1.2.3;limite=." }, null)).toEqual({
      limite: true,
      usadoUsd: null,
      limiteUsd: null,
    })
  })

  it("throws a plain error, not a configuration one, for an unknown database error", () => {
    let lanzado: unknown
    try {
      resultadoDeReserva({ message: "deadlock_detected" }, null)
    } catch (error) {
      lanzado = error
    }
    expect(lanzado).toBeInstanceOf(Error)
    expect(lanzado).not.toBeInstanceOf(FallaDeConfiguracion)
    expect((lanzado as Error).message).toContain("deadlock_detected")
  })

  it("throws when the database answers neither an error nor a row", () => {
    expect(() => resultadoDeReserva(null, null)).toThrow("La base no devolvió el gasto reservado.")
  })

  it("fails as a configuration error without the settings row", () => {
    expect(() => resultadoDeReserva({ message: "ajustes_faltantes" }, null)).toThrow(FallaDeConfiguracion)
  })

  it("hands back the reserved row", () => {
    expect(resultadoDeReserva(null, GASTO)).toEqual({ limite: false, gasto: GASTO })
  })
})
