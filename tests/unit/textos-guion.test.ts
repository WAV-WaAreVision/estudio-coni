import { describe, expect, it } from "vitest"
import { separarFallaDeVoz, textoGraboEn } from "@/app/(app)/guion/[id]/textos"

describe("separarFallaDeVoz", () => {
  it("titles a voice failure and keeps the rest of the reason as its detail", () => {
    expect(separarFallaDeVoz("No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz.")).toEqual({
      titulo: "No pude preparar tu voz.",
      detalle: "Vuelve a intentarlo con Preparar mi voz.",
    })
  })

  it("has no detail when the reason is only the title", () => {
    expect(separarFallaDeVoz("No pude preparar tu voz.")).toEqual({ titulo: "No pude preparar tu voz.", detalle: null })
  })

  it("keeps any other reason whole under the title", () => {
    const tope = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."
    expect(separarFallaDeVoz(tope)).toEqual({ titulo: "No pude preparar tu voz.", detalle: tope })
  })
})

describe("textoGraboEn", () => {
  it("says the seconds really left of the window, 8 at most", () => {
    expect(textoGraboEn(8000)).toBe("Grabo tu video en 8 s")
    expect(textoGraboEn(7800)).toBe("Grabo tu video en 8 s")
    expect(textoGraboEn(4200)).toBe("Grabo tu video en 5 s")
    expect(textoGraboEn(12_000)).toBe("Grabo tu video en 8 s")
  })
})
