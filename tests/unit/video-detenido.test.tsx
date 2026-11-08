import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PantallaDeVideoDetenido, VideoDetenido } from "@/app/(app)/guion/[id]/video-detenido"
import { TEXTO_PAUSA } from "@/lib/dominio/pausas"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/app/(app)/acciones-avisar", () => ({ avisarAFedericoAccion: vi.fn() }))

const PIEZA = "6f1c2a4e-1b7d-4c55-9a39-2f6a8f0e1d11"
const HEYGEN = "HeyGen respondió 400: avatar_not_found"

describe("VideoDetenido", () => {
  it("says what happened in her words and offers «Avisar a Federico» with the piece", () => {
    render(<VideoDetenido piezaId={PIEZA} explicacion={HEYGEN} aviso={{ avisado: false }} />)

    const bloque = screen.getByRole("alert")
    expect(bloque).toHaveTextContent("El video está detenido")
    expect(bloque).toHaveTextContent("No puedo seguir grabando por ahora.")
    expect(bloque).not.toHaveTextContent(/Avísale a Federico/)
    expect(screen.getByRole("button", { name: "Avisar a Federico" })).toBeInTheDocument()
    expect(screen.getByText("Detalle para WAV")).toBeInTheDocument()
  })

  it("says Federico was told once the email went out", () => {
    render(<VideoDetenido piezaId={PIEZA} explicacion={HEYGEN} aviso={{ avisado: true }} />)

    expect(screen.getByText("Le avisé a Federico.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Avisar a Federico" })).toBeNull()
  })

  it("offers no button for a pause: WAV already knows", () => {
    render(<VideoDetenido piezaId={PIEZA} explicacion={TEXTO_PAUSA.heygen} aviso={null} />)

    expect(screen.getByText(TEXTO_PAUSA.heygen)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Avisar a Federico" })).toBeNull()
  })
})

describe("PantallaDeVideoDetenido (issue 101, decision 4)", () => {
  const PILAR = { slug: "deseo", nombre: "Deseo y vínculo", nombreCorto: "Deseo" }

  function mostrar() {
    return render(
      <PantallaDeVideoDetenido
        titulo="El deseo no se apaga, se esconde"
        pilar={PILAR}
        segundos={52}
        piezaId={PIEZA}
        explicacion={HEYGEN}
        aviso={{ avisado: false }}
      />,
    )
  }

  it("marks itself as a wide screen, like the gates, so the column widens on a computer", () => {
    const { container } = mostrar()
    expect(container.querySelector("[data-ancho=puerta]")).not.toBeNull()
  })

  it("puts what happened, «Avisar a Federico» and «Volver a Inicio» in the main column", () => {
    mostrar()
    const principal = screen.getByTestId("detenido-principal")
    expect(within(principal).getByRole("alert")).toHaveTextContent("El video está detenido")
    expect(within(principal).getByRole("button", { name: "Avisar a Federico" })).toBeInTheDocument()
    expect(within(principal).getByRole("link", { name: "Volver a Inicio" })).toHaveAttribute("href", "/")
  })

  it("keeps the piece's card (title, pillar, length) apart, for the side column", () => {
    mostrar()
    const tarjeta = screen.getByTestId("detenido-pieza")
    expect(within(tarjeta).getByRole("heading", { level: 1 })).toHaveTextContent("El deseo no se apaga, se esconde")
    expect(tarjeta).toHaveTextContent("Deseo")
    expect(tarjeta).toHaveTextContent("52 s")
    expect(within(tarjeta).queryByRole("alert")).toBeNull()
  })

  it("keeps the phone's order: the way back, the title, then what happened", () => {
    mostrar()
    const volver = screen.getByRole("link", { name: "Inicio" })
    const titulo = screen.getByRole("heading", { level: 1 })
    const bloque = screen.getByRole("alert")
    expect(volver.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(titulo.compareDocumentPosition(bloque) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
