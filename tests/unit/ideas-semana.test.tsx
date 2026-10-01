import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { IdeasSemana } from "@/app/(app)/ideas-semana"

const IDEAS = [
  { id: "i1", gancho: "¿Te achicas para que nadie se incomode?", pilar: "autoestima" as const },
  { id: "i2", gancho: "Si van a discutir, siéntense del mismo lado.", pilar: "pareja" as const },
  { id: "i3", gancho: "Un visto sin respuesta y ya imaginas lo peor.", pilar: "bienestar" as const },
  { id: "i4", gancho: "Puedes decir que no sin explicaciones larguísimas.", pilar: "limites" as const },
  { id: "i5", gancho: "¿Tu deseo se apagó o tu cuerpo está en modo alerta?", pilar: "deseo" as const },
]

function elegir(...ganchos: string[]) {
  for (const gancho of ganchos) fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(gancho.slice(0, 20)) }))
}

describe("IdeasSemana", () => {
  it("offers the ideas with the pillar named, and asks for three", () => {
    render(<IdeasSemana ideas={IDEAS} alElegir={vi.fn()} />)

    expect(screen.getAllByRole("checkbox")).toHaveLength(5)
    expect(screen.getByText("Pareja y conversación")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escribir 3 guiones" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Elige 3 más.")).toBeInTheDocument()
  })

  it("counts down how many are left to choose", () => {
    render(<IdeasSemana ideas={IDEAS} alElegir={vi.fn()} />)

    elegir(IDEAS[0].gancho)

    expect(screen.getByText("Elige 2 más.")).toBeInTheDocument()
  })

  it("does not let her pick a fourth idea", () => {
    render(<IdeasSemana ideas={IDEAS} alElegir={vi.fn()} />)

    elegir(IDEAS[0].gancho, IDEAS[1].gancho, IDEAS[2].gancho)

    expect(screen.getByRole("checkbox", { name: new RegExp(IDEAS[3].gancho.slice(0, 20)) })).toBeDisabled()
    expect(screen.getByRole("checkbox", { name: new RegExp(IDEAS[0].gancho.slice(0, 20)) })).toBeEnabled()
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
