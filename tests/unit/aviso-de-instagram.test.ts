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
  })

  it("says Federico knows only when the callback told him itself (issue 111)", () => {
    expect(avisoDeInstagram("sin_app", true)?.texto).toBe("Falta configurar la app de Meta. Le avisé a Federico.")
    expect(avisoDeInstagram("sin_app")?.texto).toBe("Falta configurar la app de Meta. Vuelve a intentarlo más tarde.")
    expect(avisoDeInstagram("fallo", true)?.texto).toBe("Inténtalo de nuevo en unos minutos. Le avisé a Federico.")
    expect(avisoDeInstagram("fallo")?.texto).toBe("Inténtalo de nuevo en unos minutos.")
    expect(avisoDeInstagram("cancelada", true)?.texto).toBe("Cuando quieras, vuelve a intentarlo desde Cuentas conectadas.")
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
