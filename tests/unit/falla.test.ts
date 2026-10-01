import { describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"

describe("Falla y FallaDeConfiguracion", () => {
  it("no deja pasar un error de configuración por un catch que muestra las Falla a coni", () => {
    const error = new FallaDeConfiguracion("Falta heygen.avatar_id en la configuración.")
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
    expect(error.name).toBe("FallaDeConfiguracion")
  })

  it("deja pasar una Falla como mensaje para coni", () => {
    const error = new Falla("Falta el guion.")
    expect(error).toBeInstanceOf(Falla)
    expect(error.message).toBe("Falta el guion.")
  })
})
