import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TarjetaDeSaldos } from "@/app/(app)/ajustes/saldos"

describe("TarjetaDeSaldos", () => {
  it("shows both balances and explains that the API balance is not the plan", () => {
    render(
      <TarjetaDeSaldos
        voz="ElevenLabs: te quedan 23.400 de 100.000 caracteres."
        video="Saldo de API de HeyGen: US$ 0,00. Es aparte de tu plan de HeyGen."
      />,
    )

    expect(screen.getByText("ElevenLabs: te quedan 23.400 de 100.000 caracteres.")).toBeInTheDocument()
    expect(screen.getByText("Saldo de API de HeyGen: US$ 0,00. Es aparte de tu plan de HeyGen.")).toBeInTheDocument()
    expect(
      screen.getByText(
        "El saldo de API de HeyGen es distinto de los créditos de tu plan: Conidolly graba con el saldo de API.",
      ),
    ).toBeInTheDocument()
  })
})
