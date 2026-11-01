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

  it("fails as a configuration error without the settings row", () => {
    expect(() => resultadoDeReserva({ message: "ajustes_faltantes" }, null)).toThrow(FallaDeConfiguracion)
  })

  it("hands back the reserved row", () => {
    expect(resultadoDeReserva(null, GASTO)).toEqual({ limite: false, gasto: GASTO })
  })
})
