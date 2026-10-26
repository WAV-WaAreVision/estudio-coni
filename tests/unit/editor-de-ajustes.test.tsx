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
  destinos: ["instagram"] as ("instagram" | "linkedin")[],
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

function mostrar(cambios: Partial<AccionesDelEditor> = {}, linkedinConectado = false) {
  const a = acciones(cambios)
  render(<EditorDeAjustes inicial={INICIAL} acciones={a} linkedinConectado={linkedinConectado} />)
  return a
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe("EditorDeAjustes", () => {
  it("folds the spending cap under Para WAV, with what the page adds there, out of her way", () => {
    render(
      <EditorDeAjustes
        inicial={INICIAL}
        acciones={acciones()}
        linkedinConectado={false}
        paraWav={<a href="/ajustes/cuentas">Cuentas conectadas</a>}
      />,
    )
    const pliegue = screen.getByText("Para WAV").closest("details")
    expect(pliegue).not.toBeNull()
    expect(pliegue).not.toHaveAttribute("open")
    expect(pliegue).toContainElement(screen.getByRole("button", { name: "Subir el tope" }))
    expect(pliegue).toContainElement(screen.getByText("Llevas US$ 12,80 este mes"))
    expect(pliegue).toContainElement(screen.getByRole("link", { name: "Cuentas conectadas" }))
  })

  it("shows the current settings", () => {
    mostrar()

    expect(screen.getByRole("combobox", { name: "Meta de este mes" })).toHaveValue("consultas")
    expect(screen.getByRole("button", { name: "Mar" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Lun" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByLabelText("Hora de publicación")).toHaveValue("19:00")
    expect(screen.getByText("US$ 40")).toBeInTheDocument()
    expect(screen.getByText("Llevas US$ 12,80 este mes")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Resumen diario a las 08:30" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText(/Lo que ya aprobaste mantiene su fecha/)).toBeInTheDocument()
  })

  it("saves the goal on its own, says so, and takes it back on Deshacer", async () => {
    const a = mostrar({
      guardar: vi.fn(async () => ({
        ok: true as const,
        anterior: { campo: "meta", valor: "consultas" } as CambioDeAjuste,
      })),
    })

    fireEvent.change(screen.getByRole("combobox", { name: "Meta de este mes" }), { target: { value: "talleres" } })

    await waitFor(() => expect(a.guardar).toHaveBeenCalledWith({ campo: "meta", valor: "talleres" }))
    expect(await screen.findByText("Guardado")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Meta de este mes" })).toHaveValue("talleres")

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "meta", valor: "consultas" }))
    expect(screen.getByRole("combobox", { name: "Meta de este mes" })).toHaveValue("consultas")
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

  it("saves the hour as soon as she picks it with the native picker", async () => {
    const a = mostrar()
    const campo = screen.getByLabelText("Hora de publicación")

    fireEvent.change(campo, { target: { value: "20:30" } })

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
    render(<EditorDeAjustes inicial={{ ...INICIAL, tope: 0 }} acciones={acciones()} linkedinConectado={false} />)

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

    fireEvent.click(screen.getByRole("switch", { name: "Resumen diario a las 08:30" }))
    await waitFor(() => expect(a.guardar).toHaveBeenCalledWith({ campo: "avisos_resumen", valor: false }))

    fireEvent.click(screen.getByRole("switch", { name: "Avisarme apenas falle algo" }))
    await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "avisos_urgentes", valor: false }))
  })

  it("puts the screen back and says why when a change could not be saved", async () => {
    mostrar({
      guardar: vi.fn(async () => ({
        ok: false as const,
        error: "Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos.",
      })),
    })

    fireEvent.change(screen.getByRole("combobox", { name: "Meta de este mes" }), { target: { value: "marca" } })

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado")
    expect(screen.getByRole("combobox", { name: "Meta de este mes" })).toHaveValue("consultas")
  })

  it("shows the publishing days as seven chips and the hour as a value row", () => {
    mostrar()

    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(3)
    expect(screen.getByLabelText("Hora de publicación")).toHaveAttribute("type", "time")
    expect(screen.getByText("hora de Chile")).toBeInTheDocument()
  })

  it("draws the month's spend as a sunken meter that adds a warning icon from 80 percent of the cap", () => {
    render(<EditorDeAjustes inicial={{ ...INICIAL, usado: 32 }} acciones={acciones()} linkedinConectado={false} />)

    expect(screen.getByRole("meter", { name: "Gasto del mes" })).toHaveAttribute("aria-valuenow", "32")
    expect(screen.getByText("Llevas US$ 32,00 este mes")).toHaveClass("text-tinta")
    expect(screen.getByText("Llevas US$ 32,00 este mes").querySelector("svg")).not.toBeNull()
  })

  it("keeps the spend in ink below 80 percent", () => {
    mostrar()

    expect(screen.getByText("Llevas US$ 12,80 este mes")).toHaveClass("text-tinta")
  })

  describe("dónde se publica", () => {
    it("shows both networks, with LinkedIn marked as by hand while it is not connected, and what the setting does", () => {
      mostrar()

      expect(screen.getByRole("heading", { name: "Dónde se publica" })).toBeInTheDocument()
      expect(screen.getByRole("switch", { name: "Instagram" })).toHaveAttribute("aria-checked", "true")
      expect(screen.getByRole("switch", { name: "LinkedIn" })).toHaveAttribute("aria-checked", "false")
      expect(screen.getByText("A mano")).toBeInTheDocument()
      expect(screen.queryByText("A mano por ahora")).toBeNull()
      expect(
        screen.getByText(
          /Si LinkedIn está conectado, a la hora aprobada sale solo. Si no, te aviso y te dejo el video y el texto listos para subirlo a mano./,
        ),
      ).toBeInTheDocument()
    })

    it("says LinkedIn goes out by itself when it is connected", () => {
      mostrar({}, true)

      expect(screen.getByText("Sale solo")).toBeInTheDocument()
      expect(screen.queryByText("A mano")).toBeNull()
    })

    it("saves the new list by itself, in the canonical order", async () => {
      const a = mostrar()

      fireEvent.click(screen.getByRole("switch", { name: "LinkedIn" }))

      await waitFor(() =>
        expect(a.guardar).toHaveBeenCalledWith({ campo: "destinos", valor: ["instagram", "linkedin"] }),
      )
      expect(screen.getByRole("switch", { name: "LinkedIn" })).toHaveAttribute("aria-checked", "true")
    })

    it("refuses turning off the last destination and says why", () => {
      const a = mostrar()

      fireEvent.click(screen.getByRole("switch", { name: "Instagram" }))

      expect(a.guardar).not.toHaveBeenCalled()
      expect(screen.getByText("Deja al menos un destino.")).toBeInTheDocument()
      expect(screen.getByRole("switch", { name: "Instagram" })).toHaveAttribute("aria-checked", "true")
    })

    it("lets her turn Instagram off once LinkedIn is on", async () => {
      const a = mostrar()
      fireEvent.click(screen.getByRole("switch", { name: "LinkedIn" }))
      await waitFor(() => expect(a.guardar).toHaveBeenCalledTimes(1))

      fireEvent.click(screen.getByRole("switch", { name: "Instagram" }))

      await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "destinos", valor: ["linkedin"] }))
    })
  })
})
