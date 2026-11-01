import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TusDatos } from "@/app/(app)/ajustes/tus-datos"

describe("TusDatos", () => {
  it("opens the data register and the AI page from Ajustes", () => {
    render(<TusDatos />)

    expect(screen.getByRole("heading", { name: "Tus datos y la IA" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Datos personales" })).toHaveAttribute("href", "/ajustes/datos-personales")
    expect(screen.getByRole("link", { name: "Página de IA" })).toHaveAttribute("href", "/ajustes/pagina-de-ia")
  })
})
