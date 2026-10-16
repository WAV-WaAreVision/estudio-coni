import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { IdeasSemana } from "@/app/(app)/ideas-semana"

const IDEAS = [
  { id: "i1", gancho: "¿Te achicas para que nadie se incomode?", pilar: "autoestima" as const },
  { id: "i2", gancho: "Si van a discutir, siéntense del mismo lado.", pilar: "pareja" as const },
  { id: "i3", gancho: "Un visto sin respuesta y ya imaginas lo peor.", pilar: "bienestar" as const },
  { id: "i4", gancho: "Puedes decir que no sin explicaciones larguísimas.", pilar: "limites" as const },
  { id: "i5", gancho: "¿Tu deseo se apagó o tu cuerpo está en modo alerta?", pilar: "deseo" as const },
]

const EXTRA = { id: "i6", gancho: "Descansar también es avanzar, aunque no se note.", pilar: "bienestar" as const }

function elegir(...ganchos: string[]) {
  for (const gancho of ganchos) fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(gancho.slice(0, 20)) }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe("IdeasSemana", () => {
  it("keeps the toast's 8 s while she picks again: a re-render does not restart its timer", async () => {
    vi.useFakeTimers()
    render(<IdeasSemana ideas={IDEAS} alElegir={vi.fn(async () => ({ ok: true as const, piezas: ["p1"] }))} />)
    elegir(IDEAS[0].gancho)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Escribir 1 guion" }))
    })
    const aviso = "Escribiendo 1 guiones. Te aviso cuando estén."
    expect(screen.getByText(aviso)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    elegir(IDEAS[1].gancho)
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText(aviso)).toBeNull()
  })

  it("offers the ideas with the pillar named, and asks for at least one", () => {
    render(<IdeasSemana ideas={IDEAS} alElegir={vi.fn()} />)

    expect(screen.getAllByRole("checkbox")).toHaveLength(5)
    expect(screen.getByText("Pareja y conversación")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escribir guiones" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Elige al menos una idea. Puedes elegir hasta 5.")).toBeInTheDocument()
  })

  it("enables the button with one idea and writes the label in the singular", () => {
    render(<IdeasSemana ideas={IDEAS} alElegir={vi.fn()} />)

    elegir(IDEAS[0].gancho)

    expect(screen.getByRole("button", { name: "Escribir 1 guion" })).not.toHaveAttribute("aria-disabled", "true")
  })

  it("says how many more she can add, and does not claim anything was sent", () => {
    render(<IdeasSemana ideas={IDEAS} alElegir={vi.fn()} />)

    elegir(IDEAS[0].gancho, IDEAS[1].gancho)

    expect(screen.getByText("Puedes sumar hasta 3 más.")).toBeInTheDocument()
    expect(screen.queryByText("Te aviso cuando estén listos.")).not.toBeInTheDocument()
  })

  it("writes the label in the plural with two ideas", () => {
    render(<IdeasSemana ideas={IDEAS} alElegir={vi.fn()} />)

    elegir(IDEAS[0].gancho, IDEAS[1].gancho)

    expect(screen.getByRole("button", { name: "Escribir 2 guiones" })).not.toHaveAttribute("aria-disabled", "true")
  })

  it("does not let her pick a sixth idea and says she reached the maximum", () => {
    render(<IdeasSemana ideas={[...IDEAS, EXTRA]} alElegir={vi.fn()} />)

    elegir(...IDEAS.map((idea) => idea.gancho))

    expect(screen.getByRole("checkbox", { name: new RegExp(EXTRA.gancho.slice(0, 20)) })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    expect(screen.getByRole("checkbox", { name: new RegExp(IDEAS[0].gancho.slice(0, 20)) })).not.toHaveAttribute(
      "aria-disabled",
    )
    expect(screen.getByText("Llegaste al máximo de 5.")).toBeInTheDocument()
  })

  it("sends the three chosen ideas and tells her the scripts are being written", async () => {
    const alElegir = vi.fn().mockResolvedValue({ ok: true, piezas: ["p1", "p2", "p3"] })
    render(<IdeasSemana ideas={IDEAS} alElegir={alElegir} />)
    elegir(IDEAS[0].gancho, IDEAS[2].gancho, IDEAS[4].gancho)

    fireEvent.click(screen.getByRole("button", { name: "Escribir 3 guiones" }))

    await waitFor(() => expect(alElegir).toHaveBeenCalledWith(["i1", "i3", "i5"]))
    expect(await screen.findByText("Escribiendo 3 guiones. Te aviso cuando estén.")).toBeInTheDocument()
  })

  it("shows why it failed and keeps her choice", async () => {
    const alElegir = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Una de esas ideas ya no está disponible. Vuelve a elegir." })
    render(<IdeasSemana ideas={IDEAS} alElegir={alElegir} />)
    elegir(IDEAS[0].gancho, IDEAS[1].gancho, IDEAS[2].gancho)

    fireEvent.click(screen.getByRole("button", { name: "Escribir 3 guiones" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Una de esas ideas ya no está disponible.")
    expect(screen.getByRole("checkbox", { name: new RegExp(IDEAS[0].gancho.slice(0, 20)) })).toBeChecked()
  })

  it("says the bank is used up when there are no ideas", () => {
    render(<IdeasSemana ideas={[]} alElegir={vi.fn()} />)

    expect(screen.getByText(/usaste todas las ideas/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Escribir una idea" })).toHaveAttribute("href", "/ideas")
  })
})
