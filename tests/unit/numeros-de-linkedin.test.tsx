import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NumerosDeLinkedin } from "@/app/(app)/metricas/numeros-de-linkedin"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const PENDIENTES = [
  {
    piezaId: "11111111-1111-4111-8111-111111111111",
    titulo: "Si van a discutir",
    fecha: "miércoles 14 · 19:00",
    estaSemana: null,
  },
]

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
}

describe("NumerosDeLinkedin", () => {
  it("sends the four numbers of a post and the followers, then says it saved", async () => {
    const alGuardar = vi.fn(async () => ({ ok: true as const, anotados: 1 }))
    render(
      <NumerosDeLinkedin posts={PENDIENTES} seguidores={null} seguidoresAutomaticos={false} alGuardar={alGuardar} />,
    )

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
    expect(await screen.findByText("Guardado: 1 post y los seguidores.")).toBeInTheDocument()
  })

  it("does not send a half-filled post and says which one", async () => {
    const alGuardar = vi.fn()
    render(
      <NumerosDeLinkedin posts={PENDIENTES} seguidores={null} seguidoresAutomaticos={false} alGuardar={alGuardar} />,
    )

    escribir("Impresiones de Si van a discutir", "5")
    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).not.toHaveBeenCalled()
    expect(
      screen.getByText("Completa los cuatro números de «Si van a discutir» o déjalos todos vacíos."),
    ).toBeInTheDocument()
  })

  it("says when there is no LinkedIn post in the last four weeks and keeps the followers it knows", () => {
    render(<NumerosDeLinkedin posts={[]} seguidores={830} seguidoresAutomaticos={false} alGuardar={vi.fn()} />)

    expect(screen.getByText("No hay posts de LinkedIn de las últimas 4 semanas.")).toBeInTheDocument()
    expect(screen.getByLabelText("Seguidores esta semana")).toHaveValue("830")
  })

  it("shows a post noted this week with its numbers and sends it again only when corrected", async () => {
    const anotado = {
      ...PENDIENTES[0],
      piezaId: "22222222-2222-4222-8222-222222222222",
      titulo: "Lo que firma un modelo",
      estaSemana: { impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 },
    }
    const alGuardar = vi.fn(async () => ({ ok: true as const, anotados: 1 }))
    render(
      <NumerosDeLinkedin
        posts={[...PENDIENTES, anotado]}
        seguidores={null}
        seguidoresAutomaticos={false}
        alGuardar={alGuardar}
      />,
    )

    expect(screen.getByLabelText("Impresiones de Lo que firma un modelo")).toHaveValue("1.200")
    expect(screen.getByText("Anotado esta semana: puedes corregirlo.")).toBeInTheDocument()
    escribir("Impresiones de Lo que firma un modelo", "1.300")
    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).toHaveBeenCalledWith({
      posts: [{ piezaId: anotado.piezaId, impresiones: 1300, reacciones: 14, comentarios: 3, compartidos: 1 }],
      seguidores: null,
    })
    expect(await screen.findByText("Guardado: 1 post.")).toBeInTheDocument()
    expect(screen.getByLabelText("Impresiones de Lo que firma un modelo")).toHaveValue("1.300")
  })

  it("says it saved the followers when only the followers changed", async () => {
    const alGuardar = vi.fn(async () => ({ ok: true as const, anotados: 0 }))
    render(
      <NumerosDeLinkedin posts={PENDIENTES} seguidores={800} seguidoresAutomaticos={false} alGuardar={alGuardar} />,
    )

    escribir("Seguidores esta semana", "830")
    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).toHaveBeenCalledWith({ posts: [], seguidores: 830 })
    expect(await screen.findByText("Guardado: los seguidores.")).toBeInTheDocument()
  })

  it("does not send followers it already has, and asks for something when nothing changed", () => {
    const alGuardar = vi.fn()
    render(
      <NumerosDeLinkedin posts={PENDIENTES} seguidores={830} seguidoresAutomaticos={false} alGuardar={alGuardar} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).not.toHaveBeenCalled()
    expect(screen.getByText("Anota al menos un post o los seguidores.")).toBeInTheDocument()
  })

  it("shows followers from the API as read only and never sends them", async () => {
    const alGuardar = vi.fn(async () => ({ ok: true as const, anotados: 1 }))
    render(<NumerosDeLinkedin posts={PENDIENTES} seguidores={900} seguidoresAutomaticos alGuardar={alGuardar} />)

    expect(screen.getByLabelText("Seguidores esta semana")).toHaveAttribute("readonly")
    expect(screen.getByText("Los seguidores de esta semana llegaron solos; no se cambian a mano.")).toBeInTheDocument()
    escribir("Impresiones de Si van a discutir", "1.200")
    escribir("Reacciones de Si van a discutir", "14")
    escribir("Comentarios de Si van a discutir", "3")
    escribir("Compartidos de Si van a discutir", "1")
    fireEvent.click(screen.getByRole("button", { name: "Guardar números" }))

    expect(alGuardar).toHaveBeenCalledWith({
      posts: [{ piezaId: PENDIENTES[0]?.piezaId, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }],
      seguidores: null,
    })
  })
})
