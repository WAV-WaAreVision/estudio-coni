import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AvisarAFederico } from "@/components/avisar-a-federico"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
const { avisarAFedericoAccion } = vi.hoisted(() => ({ avisarAFedericoAccion: vi.fn() }))
vi.mock("@/app/(app)/acciones-avisar", () => ({ avisarAFedericoAccion }))

const PIEZA = "6f1c2a4e-1b7d-4c55-9a39-2f6a8f0e1d11"

beforeEach(() => {
  avisarAFedericoAccion.mockReset().mockResolvedValue({ ok: true })
})

describe("AvisarAFederico", () => {
  it("says Federico was told, with no button, when the email already went out", () => {
    render(<AvisarAFederico tipo="pieza" id={PIEZA} avisado />)

    expect(screen.getByText("Le avisé a Federico.")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("offers a secondary button of at least 44 px while Federico does not know", () => {
    render(<AvisarAFederico tipo="pieza" id={PIEZA} avisado={false} />)

    const boton = screen.getByRole("button", { name: "Avisar a Federico" })
    expect(boton).toHaveClass("bg-piedra", "min-h-objetivo")
    expect(boton).not.toHaveClass("bg-tinta")
    expect(screen.queryByText("Le avisé a Federico.")).toBeNull()
  })

  it("calls the action once with the entity, shows it busy and then says Federico was told", async () => {
    let responder: (valor: { ok: true }) => void = () => {}
    avisarAFedericoAccion.mockReturnValue(
      new Promise((resolver) => {
        responder = resolver
      }),
    )
    render(<AvisarAFederico tipo="material" id={PIEZA} avisado={false} />)

    const boton = screen.getByRole("button", { name: "Avisar a Federico" })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).toHaveAttribute("aria-busy", "true"))
    expect(boton).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(boton)

    responder({ ok: true })
    expect(await screen.findByText("Le avisé a Federico.")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
    expect(avisarAFedericoAccion).toHaveBeenCalledTimes(1)
    expect(avisarAFedericoAccion).toHaveBeenCalledWith({ tipo: "material", id: PIEZA })
  })

  it("shows a refusal under the button and leaves it ready to try again", async () => {
    avisarAFedericoAccion.mockResolvedValue({
      ok: false,
      error: "Esto ya no está fallando. Vuelve a abrir la pantalla.",
    })
    render(<AvisarAFederico tipo="pieza" id={PIEZA} avisado={false} />)

    fireEvent.click(screen.getByRole("button", { name: "Avisar a Federico" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Esto ya no está fallando. Vuelve a abrir la pantalla.")
    const boton = screen.getByRole("button", { name: "Avisar a Federico" })
    expect(boton).not.toHaveAttribute("aria-disabled")
    expect(screen.queryByText("Le avisé a Federico.")).toBeNull()
  })
})
