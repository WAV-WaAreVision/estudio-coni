import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NumerosDeLinkedin } from "@/app/(app)/metricas/numeros-de-linkedin"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const PENDIENTES = [
  { piezaId: "11111111-1111-4111-8111-111111111111", titulo: "Si van a discutir", fecha: "miércoles 14 · 19:00" },
]

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
}

describe("NumerosDeLinkedin", () => {
  it("sends the four numbers of a post and the followers, then says it saved", async () => {
    const alGuardar = vi.fn(async () => ({ ok: true as const, anotados: 1 }))
    render(<NumerosDeLinkedin pendientes={PENDIENTES} seguidores={null} alGuardar={alGuardar} />)

    escribir("Impresiones de Si van a discutir", "1.200")
    escribir("Reacciones de Si van a discutir", "14")
    escribir("Comentarios de Si van a discutir", "3")
    escribir("Compartidos de Si van a discutir", "1")
    escribir("Seguidores esta semana", "830")
    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).toHaveBeenCalledWith({
      posts: [{ piezaId: PENDIENTES[0]?.piezaId, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }],
      seguidores: 830,
    })
    expect(await screen.findByText("Guardado: 1 post.")).toBeInTheDocument()
  })

  it("does not send a half-filled post and says which one", async () => {
    const alGuardar = vi.fn()
    render(<NumerosDeLinkedin pendientes={PENDIENTES} seguidores={null} alGuardar={alGuardar} />)

    escribir("Impresiones de Si van a discutir", "5")
    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).not.toHaveBeenCalled()
    expect(
      screen.getByText("Completa los cuatro números de «Si van a discutir» o déjalos todos vacíos."),
    ).toBeInTheDocument()
  })

  it("says when every post already has this week's numbers and keeps the followers it knows", () => {
    render(<NumerosDeLinkedin pendientes={[]} seguidores={830} alGuardar={vi.fn()} />)

    expect(
      screen.getByText("Todos los posts de las últimas 4 semanas ya tienen sus números de esta semana."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Seguidores esta semana")).toHaveValue("830")
  })
})
