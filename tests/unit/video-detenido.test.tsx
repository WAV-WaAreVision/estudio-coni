import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { VideoDetenido } from "@/app/(app)/guion/[id]/video-detenido"
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
