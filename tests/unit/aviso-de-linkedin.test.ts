// @vitest-environment node
import { describe, expect, it } from "vitest"
import { avisoDeLinkedin } from "@/lib/ajustes/linkedin-aviso"

describe("avisoDeLinkedin", () => {
  it.each([
    ["conectada", "ok", "LinkedIn quedó conectado."],
    ["cancelada", "aviso", "Cancelaste la conexión con LinkedIn."],
    ["rechazada", "error", "LinkedIn no aceptó la conexión."],
    ["permisos", "error", "LinkedIn no dio permiso para publicar."],
    ["estado", "error", "La conexión con LinkedIn venció antes de terminar."],
    ["sin_app", "error", "Todavía no está lista la conexión con LinkedIn."],
    ["fallo", "error", "No pude terminar la conexión con LinkedIn."],
  ])("handles %s when the callback says it", (valor, tipo, titulo) => {
    expect(avisoDeLinkedin(valor)).toMatchObject({ tipo, titulo })
  })

  it("says Federico knows only when the callback told him itself (issue 111)", () => {
    expect(avisoDeLinkedin("sin_app", true)?.texto).toBe("Falta configurar la app de LinkedIn. Le avisé a Federico.")
    expect(avisoDeLinkedin("sin_app")?.texto).toBe("Falta configurar la app de LinkedIn. Vuelve a intentarlo más tarde.")
    expect(avisoDeLinkedin("fallo", true)?.texto).toBe("Inténtalo de nuevo en unos minutos. Le avisé a Federico.")
    expect(avisoDeLinkedin("fallo")?.texto).toBe("Inténtalo de nuevo en unos minutos.")
  })

  it("reads nothing else from the address", () => {
    expect(avisoDeLinkedin("<script>")).toBeNull()
    expect(avisoDeLinkedin("toString")).toBeNull()
    expect(avisoDeLinkedin(undefined)).toBeNull()
  })

  it("has no em dashes", () => {
    for (const valor of ["conectada", "cancelada", "rechazada", "permisos", "estado", "sin_app", "fallo"]) {
      expect(JSON.stringify(avisoDeLinkedin(valor))).not.toContain("—")
    }
  })
})
