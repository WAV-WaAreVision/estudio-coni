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
