import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Bloque } from "@/components/ui/bloque"

describe("Bloque", () => {
  it("is a flat honda block with its icon and 18 px corners, said politely", () => {
    render(<Bloque tipo="aviso">Tu saldo de ElevenLabs está bajo.</Bloque>)
    const bloque = screen.getByRole("status")
    expect(bloque).toHaveClass("bg-piedra-honda", "rounded-bloque")
    expect(bloque.className).not.toMatch(/shadow-/)
    expect(bloque.firstElementChild?.tagName.toLowerCase()).toBe("svg")
    expect(bloque).toHaveTextContent("Tu saldo de ElevenLabs está bajo.")
  })

  it("interrupts for an error, with the title in magenta after the icon and the detail in ink", () => {
    render(
      <Bloque tipo="error" titulo="No pude terminar el video.">
        HeyGen no respondió.
      </Bloque>,
    )
    const alerta = screen.getByRole("alert")
    expect(alerta.firstElementChild?.tagName.toLowerCase()).toBe("svg")
    expect(screen.getByText("No pude terminar el video.")).toHaveClass("text-error")
    expect(screen.getByText("HeyGen no respondió.")).not.toHaveClass("text-error")
  })

  it("does not interrupt again for an error the screen already announced", () => {
    render(<Bloque tipo="error" titulo="Hay que corregirlo" anunciada />)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByText("Hay que corregirlo")).toHaveClass("text-error")
  })

  it("keeps a title that is a message in ink when asked", () => {
    render(<Bloque tipo="error" titulo="No pude cargar esta pantalla." tituloEnTinta />)
    expect(screen.getByText("No pude cargar esta pantalla.")).toHaveClass("text-tinta")
  })

  it("is the large failure block with the piece title and one action", () => {
    render(
      <Bloque
        tipo="error"
        grande
        titulo="No pude terminar el video."
        pieza="El deseo no se apaga, se esconde"
        accion={<button type="button">Reintentar</button>}
      >
        HeyGen no respondió.
      </Bloque>,
    )
    const alerta = screen.getByRole("alert")
    expect(alerta).toHaveClass("rounded-panel", "p-[18px]")
    expect(within(alerta).getByText("El deseo no se apaga, se esconde")).toBeInTheDocument()
    expect(within(alerta).getByRole("button", { name: "Reintentar" })).toBeInTheDocument()
  })

  it("says good news with a check, politely", () => {
    render(<Bloque tipo="ok" titulo="El deseo se publicó hoy a las 09:00" />)
    expect(screen.getByRole("status")).toHaveTextContent("El deseo se publicó hoy a las 09:00")
  })
})
