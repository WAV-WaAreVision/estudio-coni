// @vitest-environment node
import { describe, expect, it } from "vitest"
import { avisoDeInstagram } from "@/lib/ajustes/instagram-aviso"

describe("avisoDeInstagram", () => {
  it("thanks her when the connection worked", () => {
    expect(avisoDeInstagram("conectada")).toEqual({ tipo: "ok", titulo: "Instagram quedó conectado." })
  })

  it("tells her what happened and what to do for every way the connection can stop", () => {
    for (const motivo of ["cancelada", "rechazada", "estado", "sin_app", "fallo"]) {
      const aviso = avisoDeInstagram(motivo)
      expect(aviso?.titulo).toBeTruthy()
      expect(aviso?.texto).toBeTruthy()
    }
    expect(avisoDeInstagram("sin_app")?.texto).toContain("Federico")
  })

  it("says nothing for a value it does not know, and never repeats it", () => {
    expect(avisoDeInstagram("<script>alert(1)</script>")).toBeNull()
    expect(avisoDeInstagram(undefined)).toBeNull()
  })

  it("uses no em dashes", () => {
    for (const motivo of ["conectada", "cancelada", "rechazada", "estado", "sin_app", "fallo"]) {
      expect(JSON.stringify(avisoDeInstagram(motivo))).not.toContain("—")
    }
  })
})
