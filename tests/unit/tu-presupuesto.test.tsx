import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TuPresupuesto } from "@/app/(app)/ajustes/tu-presupuesto"

describe("TuPresupuesto", () => {
  it("links Ajustes to the budget with what the month spent against the cap", () => {
    render(<TuPresupuesto usado={31.6} tope={40} />)
    expect(screen.getByRole("link", { name: "Presupuesto · US$ 32 de 40" })).toHaveAttribute(
      "href",
      "/ajustes/presupuesto",
    )
  })
})
