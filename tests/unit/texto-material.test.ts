import { describe, expect, it } from "vitest"
import type { Parte } from "@/lib/ingesta/partes"
import { renderizarPartes } from "@/lib/ingesta/texto-material"

describe("renderizarPartes", () => {
  it("labels the two tracks of a video by second, voice first when they share one", () => {
    const partes: Parte[] = [
      { texto: "Hola, soy Coni.", ubicacion: { segundo: 0, pista: "voz" } },
      { texto: "Bienvenida", ubicacion: { segundo: 0, pista: "pantalla" } },
      { texto: "Hablemos de límites.", ubicacion: { segundo: 72, pista: "voz" } },
    ]

    expect(renderizarPartes(partes)).toBe(
      "[0:00 habla] Hola, soy Coni.\n[0:00 pantalla] Bienvenida\n[1:12 habla] Hablemos de límites.",
    )
  })

  it("sorts a screen line that was read earlier than a later voice segment", () => {
    const partes: Parte[] = [
      { texto: "dos", ubicacion: { segundo: 12, pista: "voz" } },
      { texto: "uno", ubicacion: { segundo: 3, pista: "pantalla" } },
    ]

    expect(renderizarPartes(partes)).toBe("[0:03 pantalla] uno\n[0:12 habla] dos")
  })

  it("orders by the second shown in the label, so a voice at 0.4 s still follows the screen line of second 0 only after it", () => {
    const partes: Parte[] = [
      { texto: "pantalla", ubicacion: { segundo: 0, pista: "pantalla" } },
      { texto: "voz", ubicacion: { segundo: 0.4, pista: "voz" } },
    ]

    expect(renderizarPartes(partes)).toBe("[0:00 habla] voz\n[0:00 pantalla] pantalla")
  })

  it("keeps the markers of images and pages and leaves plain text unmarked", () => {
    expect(
      renderizarPartes([
        { texto: "uno", ubicacion: { imagen: 1 } },
        { texto: "tres", ubicacion: { imagen: 3 } },
      ]),
    ).toBe("[imagen 1] uno\n[imagen 3] tres")
    expect(
      renderizarPartes([
        { texto: "a", ubicacion: { pagina: 1 } },
        { texto: "b", ubicacion: { pagina: 2 } },
      ]),
    ).toBe("[página 1] a\n\n[página 2] b")
    expect(renderizarPartes([{ texto: "suelto", ubicacion: { pagina: null } }])).toBe("suelto")
  })

  it("collapses line breaks inside a spoken or on-screen line so each label stays on one line", () => {
    expect(renderizarPartes([{ texto: "una\nlínea  partida", ubicacion: { segundo: 5, pista: "pantalla" } }])).toBe(
      "[0:05 pantalla] una línea partida",
    )
  })
})
