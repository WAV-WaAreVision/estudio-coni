import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"

vi.mock("@/app/(app)/piezas/acciones", () => ({
  aprobarCarruselAccion: vi.fn(),
  cambiarDisenoAccion: vi.fn(),
  pedirCambioDeCarruselAccion: vi.fn(),
  descartarAccion: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { PantallaPuerta2Carrusel } from "@/app/(app)/guion/[id]/puerta-2-carrusel"

const DATOS = {
  id: "p",
  version: 7,
  titulo: "Lo que un chatbot no ve de ti",
  pilar: null,
  carruselId: "11111111-1111-4111-8111-111111111111",
  laminas: LAMINAS_DE_PRUEBA,
  imagenes: LAMINAS_DE_PRUEBA.map((_, i) => `https://almacen.test/${i}.png`),
  diseno: { variante: "crema" as const },
  textoPost: TEXTO_POST_DE_PRUEBA,
  fechas: [{ iso: "2026-10-29T22:00:00.000Z", etiqueta: "jueves 29 de octubre · 19:00", corta: "jueves 29 · 19:00" }],
  cambiosQuedan: 2,
  explicacion: null,
}

describe("PantallaPuerta2Carrusel", () => {
  it("opens 'Desliza para programar' only after the last slide was seen", () => {
    render(<PantallaPuerta2Carrusel datos={DATOS} />)
    const pista = screen.getByRole("slider", { name: "Desliza para programar" })
    expect(pista).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(/ver todas las láminas/)).toBeInTheDocument()
    for (let i = 1; i < LAMINAS_DE_PRUEBA.length; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Lámina siguiente" }))
    }
    expect(pista).toHaveAttribute("aria-disabled", "false")
    expect(
      screen.getByText((_, nodo) => nodo?.tagName === "P" && nodo.textContent === "Sale el jueves 29 · 19:00"),
    ).toBeInTheDocument()
  })

  it("speaks of programming, not signing, on the track and in how to use it without dragging", () => {
    render(<PantallaPuerta2Carrusel datos={DATOS} />)
    const pista = screen.getByRole("slider", { name: "Desliza para programar" })
    expect(pista).toHaveAttribute("aria-valuetext", "Sin programar")
    expect(pista).toHaveAccessibleDescription(/Enter o Espacio programan\./)
  })

  it("folds the post text and offers both kinds of change and the discard", () => {
    render(<PantallaPuerta2Carrusel datos={DATOS} />)
    expect(screen.getByRole("button", { name: "Ver texto completo" })).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(screen.getByText("Pedir cambio"))
    expect(screen.getByRole("radio", { name: /El texto/ })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /El diseño/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Descartar esta pieza" })).toBeInTheDocument()
  })

  it("says why a design change she asked for was dropped", () => {
    render(
      <PantallaPuerta2Carrusel datos={{ ...DATOS, explicacion: "Ese cambio no cabe en la lámina. Prueba otro." }} />,
    )
    expect(screen.getByText("Ese cambio no cabe en la lámina. Prueba otro.")).toBeInTheDocument()
  })
})
