import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MensajeDePrimeraVez } from "@/components/mensaje-primera-vez"

describe("MensajeDePrimeraVez", () => {
  it("tells her how to read what she sees and that she can record it again", () => {
    render(<MensajeDePrimeraVez marcar={vi.fn(async () => ({ ok: true as const }))} />)

    expect(screen.getByText("Así se ve tu avatar. Si algo no te calza, regrábalo.")).toBeInTheDocument()
  })

  it("marks it as seen once it is on screen, so the next visit does not show it again", async () => {
    const marcar = vi.fn(async () => ({ ok: true as const }))
    render(<MensajeDePrimeraVez marcar={marcar} />)

    await waitFor(() => expect(marcar).toHaveBeenCalledTimes(1))
  })

  it("keeps showing the message when marking fails: it is not lost, only repeated next time", async () => {
    const marcar = vi.fn(async () => ({ ok: false as const, error: "x" }))
    render(<MensajeDePrimeraVez marcar={marcar} />)

    await waitFor(() => expect(marcar).toHaveBeenCalled())
    expect(screen.getByText(/Así se ve tu avatar/)).toBeInTheDocument()
  })
})
