import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"

const TECNICO = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta US$ 3,48)."
const EN_SUS_PALABRAS = "No alcanza el saldo para grabar el video. Avísale a Federico."

describe("ExplicacionParaConi", () => {
  it("says it in her words and folds the provider's text and its link under 'Detalle para WAV'", () => {
    render(<ExplicacionParaConi texto={TECNICO} enSusPalabras={EN_SUS_PALABRAS} id="falta" />)
    expect(screen.getByText(EN_SUS_PALABRAS)).toHaveAttribute("id", "falta")
    const detalle = screen.getByText("Detalle para WAV").closest("details") as HTMLElement
    expect(detalle).not.toHaveAttribute("open")
    expect(detalle).toContainElement(screen.getByText(TECNICO))
    const enlace = screen.getByRole("link", { name: "Abrir HeyGen" })
    expect(enlace).toHaveAttribute("href", "https://app.heygen.com")
    expect(enlace).toHaveAttribute("target", "_blank")
    expect(enlace).toHaveAttribute("rel", expect.stringContaining("noopener"))
    expect(detalle).toContainElement(enlace)
  })

  it("shows a text written for her as it is, with no fold", () => {
    render(<ExplicacionParaConi texto="Llegaste al tope de gasto de este mes." enSusPalabras={EN_SUS_PALABRAS} />)
    expect(screen.getByText("Llegaste al tope de gasto de este mes.")).toBeInTheDocument()
    expect(screen.queryByText("Detalle para WAV")).toBeNull()
  })

  it("folds lines that are always WAV's, like a balance, under her own text", () => {
    render(
      <ExplicacionParaConi
        texto="Vuelve a intentarlo con Reintentar."
        enSusPalabras={EN_SUS_PALABRAS}
        extra={["Saldo de API de HeyGen: US$ 12,00."]}
      />,
    )
    expect(screen.getByText("Vuelve a intentarlo con Reintentar.")).toBeInTheDocument()
    const detalle = screen.getByText("Detalle para WAV").closest("details") as HTMLElement
    expect(detalle).toContainElement(screen.getByText("Saldo de API de HeyGen: US$ 12,00."))
  })
})
