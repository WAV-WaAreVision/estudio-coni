import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type AccionesDelEditor, EditorDeAjustes } from "@/app/(app)/ajustes/editor-de-ajustes"
import type { CambioDeAjuste } from "@/lib/acciones/ajustes"

const INICIAL = {
  meta: "consultas" as const,
  dias: [2, 4, 6],
  hora: "19:00",
  tope: 40,
  usado: 12.8,
  avisosResumen: true,
  avisosUrgentes: true,
}

function acciones(cambios: Partial<AccionesDelEditor> = {}): AccionesDelEditor {
  return {
    guardar: vi.fn(async (cambio: CambioDeAjuste) => ({
      ok: true as const,
      anterior: { campo: "meta", valor: "consultas" } as CambioDeAjuste,
      ...(cambio.campo === "tope" && cambio.valor < 12.8
        ? { aviso: "Ya gastaste US$ 12,80; con este tope no grabo más hasta el próximo mes." }
        : {}),
    })),
    ...cambios,
  }
}

function mostrar(cambios: Partial<AccionesDelEditor> = {}) {
  const a = acciones(cambios)
  render(<EditorDeAjustes inicial={INICIAL} acciones={a} />)
  return a
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe("EditorDeAjustes", () => {
  it("shows the current settings", () => {
    mostrar()

    expect(screen.getByRole("radio", { name: "Consultas" })).toBeChecked()
    expect(screen.getByRole("button", { name: "Mar" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Lun" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByLabelText("Hora de publicación")).toHaveValue("19:00")
    expect(screen.getByText("US$ 40")).toBeInTheDocument()
    expect(screen.getByText("Llevas US$ 12,80 este mes")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Resumen diario a las 08:30" })).toBeChecked()
    expect(screen.getByText(/Lo que ya aprobaste mantiene su fecha/)).toBeInTheDocument()
  })

  it("saves the goal on its own, says so, and takes it back on Deshacer", async () => {
    const a = mostrar({
      guardar: vi.fn(async () => ({
        ok: true as const,
        anterior: { campo: "meta", valor: "consultas" } as CambioDeAjuste,
      })),
    })

    fireEvent.click(screen.getByRole("radio", { name: "Talleres" }))

    await waitFor(() => expect(a.guardar).toHaveBeenCalledWith({ campo: "meta", valor: "talleres" }))
    expect(await screen.findByText("Guardado")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Talleres" })).toBeChecked()

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "meta", valor: "consultas" }))
    expect(screen.getByRole("radio", { name: "Consultas" })).toBeChecked()
  })

  it("adds and removes publishing days, always sending them sorted", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Lun" }))
    await waitFor(() => expect(a.guardar).toHaveBeenCalledWith({ campo: "dias", valor: [1, 2, 4, 6] }))

    fireEvent.click(screen.getByRole("button", { name: "Jue" }))
    await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "dias", valor: [1, 2, 6] }))
  })

  it("keeps at least one publishing day", () => {
    const a = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Mar" }))
    fireEvent.click(screen.getByRole("button", { name: "Jue" }))
    fireEvent.click(screen.getByRole("button", { name: "Sáb" }))

    expect(screen.getByRole("button", { name: "Sáb" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Deja al menos un día de publicación.")).toBeInTheDocument()
    expect(a.guardar).toHaveBeenCalledTimes(2)
  })

  it("saves the hour when she leaves the field", async () => {
    const a = mostrar()
    const campo = screen.getByLabelText("Hora de publicación")

    fireEvent.change(campo, { target: { value: "20:30" } })
    expect(a.guardar).not.toHaveBeenCalled()
    fireEvent.blur(campo)

    await waitFor(() => expect(a.guardar).toHaveBeenCalledWith({ campo: "hora", valor: "20:30" }))
  })

  it("moves the cap in steps of 5 and saves once, after she stops tapping", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    expect(screen.getByText("US$ 50")).toBeInTheDocument()
    expect(a.guardar).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(a.guardar).toHaveBeenCalledTimes(1)
    expect(a.guardar).toHaveBeenCalledWith({ campo: "tope", valor: 50 })
  })

  it("does not take the cap under zero", () => {
    render(<EditorDeAjustes inicial={{ ...INICIAL, tope: 0 }} acciones={acciones()} />)

    expect(screen.getByRole("button", { name: "Bajar el tope" })).toHaveAttribute("aria-disabled", "true")
  })

  it("shows the server's warning when the cap is under what was spent", async () => {
    mostrar()

    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Bajar el tope" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(await screen.findByText(/Ya gastaste US\$ 12,80; con este tope no grabo más/)).toBeInTheDocument()
  })

  it("saves the notification switches", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("checkbox", { name: "Resumen diario a las 08:30" }))
    await waitFor(() => expect(a.guardar).toHaveBeenCalledWith({ campo: "avisos_resumen", valor: false }))

    fireEvent.click(screen.getByRole("checkbox", { name: "Avisarme apenas falle algo" }))
    await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "avisos_urgentes", valor: false }))
  })

  it("puts the screen back and says why when a change could not be saved", async () => {
    mostrar({
      guardar: vi.fn(async () => ({
        ok: false as const,
        error: "Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos.",
      })),
    })

    fireEvent.click(screen.getByRole("radio", { name: "Marca" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado")
    expect(screen.getByRole("radio", { name: "Consultas" })).toBeChecked()
  })
})
