import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AvisosSinLeer } from "@/app/(app)/avisos-sin-leer"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))

const AVISOS = [
  { id: "a1", mensaje: "Tu guion «El deseo» está listo para revisar.", href: "/guion/p1", cuando: "mar 6 · 08:30" },
  { id: "a2", mensaje: "Ya tienes ideas nuevas para elegir esta semana.", href: "/", cuando: "lun 5 · 08:30" },
]

describe("AvisosSinLeer", () => {
  it("lists the unread notices with what they say and when", () => {
    render(<AvisosSinLeer avisos={AVISOS} marcar={vi.fn(async () => ({ ok: true as const }))} />)

    expect(screen.getByText("Tu guion «El deseo» está listo para revisar.")).toBeInTheDocument()
    expect(screen.getByText("mar 6 · 08:30")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Avisos" })).toBeInTheDocument()
  })

  it("lists the notices as rows of a raised group, each opening its piece", () => {
    render(<AvisosSinLeer avisos={AVISOS} marcar={vi.fn(async () => ({ ok: true as const }))} />)
    expect(screen.getByRole("list")).toHaveClass("bg-piedra", "shadow-relieve")
    for (const enlace of screen.getAllByRole("link")) expect(enlace).toHaveClass("min-h-fila")
  })

  it("marks the notice as read and then opens the piece it is about", async () => {
    const marcar = vi.fn(async () => ({ ok: true as const }))
    render(<AvisosSinLeer avisos={AVISOS} marcar={marcar} />)

    fireEvent.click(screen.getByRole("link", { name: /guion «El deseo»/ }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/guion/p1"))
    expect(marcar).toHaveBeenCalledWith("a1")
  })

  it("opens the piece even if marking fails: reading is not blocked by a bookkeeping error", async () => {
    push.mockClear()
    const marcar = vi.fn(async () => ({ ok: false as const, error: "x" }))
    render(<AvisosSinLeer avisos={AVISOS} marcar={marcar} />)

    fireEvent.click(screen.getByRole("link", { name: /guion «El deseo»/ }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/guion/p1"))
  })

  it("shows nothing when there is nothing to read", () => {
    const { container } = render(<AvisosSinLeer avisos={[]} marcar={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })
})
