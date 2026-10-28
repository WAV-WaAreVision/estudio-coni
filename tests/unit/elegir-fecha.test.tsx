import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ElegirFecha, useEleccionDeFecha } from "@/app/(app)/elegir-fecha"
import type { FechaPropuesta } from "@/app/(app)/video/[id]/pantalla-video"

const FECHAS: FechaPropuesta[] = [
  { iso: "2026-10-29T22:00:00.000Z", etiqueta: "jueves 29 de octubre · 19:00", corta: "jueves 29 · 19:00" },
]

function Prueba({ fechas = FECHAS }: { fechas?: FechaPropuesta[] }) {
  const eleccion = useEleccionDeFecha({ fechas, zona: "America/Santiago", horaDelRitmo: "19:00" })
  return (
    <>
      <ElegirFecha eleccion={eleccion} meta="LinkedIn · hora de Chile" debajo={(iso) => `debajo ${iso}`} />
      <p data-testid="elegida">{eleccion.fecha?.iso ?? "ninguna"}</p>
    </>
  )
}

describe("ElegirFecha", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // Wednesday 28 October 2026, 08:45 in Santiago.
    vi.setSystemTime(new Date("2026-10-28T11:45:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("starts on the first schedule slot and shows what follows from it", () => {
    render(<Prueba />)
    expect(screen.getByText("jueves 29 de octubre · 19:00")).toBeInTheDocument()
    expect(screen.getByText("debajo 2026-10-29T22:00:00.000Z")).toBeInTheDocument()
    expect(screen.getByTestId("elegida")).toHaveTextContent("2026-10-29T22:00:00.000Z")
  })

  it("offers another day and time, and nothing is chosen until the day is set", () => {
    render(<Prueba />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))

    expect(screen.getByTestId("elegida")).toHaveTextContent("ninguna")
    expect(screen.getByText("Elige el día.")).toBeInTheDocument()
    expect(screen.getByLabelText("Hora")).toHaveValue("19:00")
  })

  it("takes a valid day and time as the date", () => {
    render(<Prueba />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))
    fireEvent.change(screen.getByLabelText(/^Día/), { target: { value: "2026-10-28" } })
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:15" } })

    expect(screen.getByTestId("elegida")).toHaveTextContent("2026-10-28T13:15:00.000Z")
    expect(screen.getByText("miércoles 28 de octubre · 10:15")).toBeInTheDocument()
    expect(screen.getByText("miércoles 28 de octubre")).toBeInTheDocument()
  })

  it("says why a time too close does not count", () => {
    render(<Prueba />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: "Otra fecha y hora" }))
    fireEvent.change(screen.getByLabelText(/^Día/), { target: { value: "2026-10-28" } })
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "08:55" } })

    expect(screen.getByTestId("elegida")).toHaveTextContent("ninguna")
    expect(screen.getByText("Elige una hora con al menos 15 minutos de anticipación.")).toBeInTheDocument()
  })

  it("with no schedule slot opens on another day and time", () => {
    render(<Prueba fechas={[]} />)
    expect(screen.getByRole("radio", { name: "Otra fecha y hora" })).toBeChecked()
    expect(screen.getByLabelText(/^Día/)).toBeInTheDocument()
  })
})
