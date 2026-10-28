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
  zona: "America/Santiago",
  horaDelRitmo: "19:00",
  cambiosQuedan: 2,
  explicacion: null,
  linkedinExpiraEn: "2026-12-06T12:00:00.000Z",
}

describe("PantallaPuerta2Carrusel", () => {
  it("says under the date that it posts by itself while LinkedIn will be connected", () => {
    render(<PantallaPuerta2Carrusel datos={DATOS} />)
    expect(screen.getByText("Se publica solo en LinkedIn a esa hora.")).toBeInTheDocument()
  })

  it("says it will be left to upload by hand when LinkedIn is not connected", () => {
    render(<PantallaPuerta2Carrusel datos={{ ...DATOS, linkedinExpiraEn: null }} />)
    expect(screen.getByText("LinkedIn no está conectado: te lo dejo para subir a mano.")).toBeInTheDocument()
  })

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

  it("asks to choose the date when there is no free slot, instead of blocking", () => {
    render(<PantallaPuerta2Carrusel datos={{ ...DATOS, fechas: [] }} />)
    expect(screen.getByText(/elegir la fecha/)).toHaveTextContent("Falta: ver todas las láminas · elegir la fecha")
    expect(screen.queryByText(/Avísale a Federico/)).toBeNull()
  })

  it("with no free slot opens on another day and time", () => {
    render(<PantallaPuerta2Carrusel datos={{ ...DATOS, fechas: [] }} />)
    expect(screen.getByRole("radio", { name: "Otra fecha y hora" })).toBeChecked()
    expect(screen.getByLabelText(/^Día/)).toBeInTheDocument()
    expect(screen.queryByText("No hay un horario libre en los próximos días.")).not.toBeInTheDocument()
  })

  it("schedules at another day and time, and the LinkedIn line follows it", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-28T11:45:00Z"))
    render(<PantallaPuerta2Carrusel datos={{ ...DATOS, linkedinExpiraEn: "2026-11-30T12:00:00.000Z" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))
    fireEvent.change(screen.getByLabelText(/^Día/), { target: { value: "2026-12-01" } })
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:15" } })

    expect(screen.getByText("martes 1 de diciembre · 10:15")).toBeInTheDocument()
    expect(
      screen.getByText("Tu conexión con LinkedIn vence antes de esa fecha: te lo dejo para subir a mano."),
    ).toBeInTheDocument()
    vi.useRealTimers()
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
