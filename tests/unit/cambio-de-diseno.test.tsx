import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"

const { cambiarDisenoAccion } = vi.hoisted(() => ({
  cambiarDisenoAccion: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
}))
vi.mock("@/app/(app)/piezas/acciones", () => ({ cambiarDisenoAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { CambioDeDiseno } from "@/app/(app)/guion/[id]/cambio-de-diseno"

beforeEach(() => vi.clearAllMocks())

const pintar = () =>
  render(
    <CambioDeDiseno
      piezaId="p"
      version={3}
      laminas={LAMINAS_DE_PRUEBA}
      diseno={{ variante: "crema" }}
      alHacerlo={() => {}}
    />,
  )

describe("CambioDeDiseno", () => {
  it("changes the colours", async () => {
    pintar()
    fireEvent.click(screen.getByRole("radio", { name: "Oscura" }))
    fireEvent.click(screen.getByRole("button", { name: "Rehacer el diseño" }))
    await waitFor(() =>
      expect(cambiarDisenoAccion).toHaveBeenCalledWith("p", 3, { tipo: "variante", variante: "oscura" }),
    )
  })

  it("splits only a slide that can be split", async () => {
    pintar()
    fireEvent.click(screen.getByRole("radio", { name: "Dividir en dos" }))
    expect(screen.getAllByRole("option").map((opcion) => opcion.textContent)).toEqual(["Lámina 2 · Idea"])
    fireEvent.click(screen.getByRole("button", { name: "Rehacer el diseño" }))
    await waitFor(() => expect(cambiarDisenoAccion).toHaveBeenCalledWith("p", 3, { tipo: "dividir", lamina: 1 }))
  })

  it("says when no slide allows a change", () => {
    pintar()
    fireEvent.click(screen.getByRole("radio", { name: "Unir con la siguiente" }))
    expect(screen.getByText("Ninguna lámina permite este cambio ahora.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Rehacer el diseño" })).toHaveAttribute("aria-disabled", "true")
  })

  it("highlights one of the slide's own words, or none", async () => {
    pintar()
    fireEvent.click(screen.getByRole("radio", { name: "Palabra destacada" }))
    fireEvent.change(screen.getByLabelText("Lámina"), { target: { value: "2" } })
    fireEvent.change(screen.getByLabelText("Palabra"), { target: { value: "largo" } })
    fireEvent.click(screen.getByRole("button", { name: "Rehacer el diseño" }))
    await waitFor(() =>
      expect(cambiarDisenoAccion).toHaveBeenCalledWith("p", 3, { tipo: "destacar", lamina: 2, palabra: "largo" }),
    )
  })
})
