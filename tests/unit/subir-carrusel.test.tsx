import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { SubirCarruselAMano } from "@/app/(app)/guion/[id]/subir-carrusel"

describe("SubirCarruselAMano", () => {
  it("downloads the PDF, explains LinkedIn's document upload and marks it uploaded with the link", async () => {
    const alDescargar = vi.fn(async () => ({ ok: true as const, url: "https://almacen.test/c.pdf" }))
    const alMarcar = vi.fn(async () => ({ ok: true as const }))
    const alIrA = vi.fn()
    render(
      <SubirCarruselAMano
        piezaId="p"
        version={9}
        texto="El post."
        alDescargar={alDescargar}
        alMarcar={alMarcar}
        alIrA={alIrA}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Descargar PDF" }))
    await waitFor(() => expect(alIrA).toHaveBeenCalledWith("https://almacen.test/c.pdf"))
    expect(screen.getByText(/toca «Agregar un documento», sube el PDF y pega el texto/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Enlace de la publicación en LinkedIn (opcional)"), {
      target: { value: "https://www.linkedin.com/posts/x" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Ya lo subí a LinkedIn" }))
    await waitFor(() => expect(alMarcar).toHaveBeenCalledWith("p", 9, "linkedin", "https://www.linkedin.com/posts/x"))
  })
})
