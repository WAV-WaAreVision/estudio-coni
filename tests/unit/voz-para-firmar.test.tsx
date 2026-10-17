import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GrabarDeNuevo, VozParaFirmar } from "@/app/(app)/guion/[id]/voz-para-firmar"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
const { pedirVozAccion } = vi.hoisted(() => ({ pedirVozAccion: vi.fn() }))
vi.mock("@/app/(app)/piezas/acciones", () => ({ pedirVozAccion }))

const SEGUNDOS = 20
const BOTONES = {
  montoVoz: "US$ 0,33",
  unidadVoz: "~1.100 caracteres",
  saldoVoz: "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
  bloqueoVoz: null,
  bloqueoVideo: null,
}
const TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes o espera al próximo mes."

function grabacion(clave: string | null, sobre: Partial<DatosDeGrabacion> = {}): DatosDeGrabacion {
  return {
    estado: "guion_por_aprobar",
    voz: clave === null ? null : { url: `https://almacen.test/${clave}`, clave },
    botones: null,
    lineaDeFirma: "Graba el video · 8 s para deshacer",
    ...sobre,
  }
}

function escucharEntera(contenedor: HTMLElement) {
  const audio = contenedor.querySelector("audio")
  if (!audio) throw new Error("No hay audio")
  Object.defineProperty(audio, "duration", { value: SEGUNDOS, configurable: true })
  for (let t = 0; t <= SEGUNDOS; t += 0.25) {
    Object.defineProperty(audio, "currentTime", { value: t, configurable: true })
    fireEvent.timeUpdate(audio)
  }
}

beforeEach(() => {
  pedirVozAccion.mockReset().mockResolvedValue({ ok: true })
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("VozParaFirmar", () => {
  it("is the first step of gate 1", () => {
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion("voces/p1/t-x-0.mp3")}
        explicacion={null}
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    expect(screen.getByRole("heading", { name: "1. Escucha tu voz" })).toBeInTheDocument()
  })

  it("treats another take as unheard: the player starts over and reports the new take once she hears it", () => {
    const alEscuchar = vi.fn()
    const { container, rerender } = render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion("voces/p1/t-x-0.mp3")}
        explicacion={null}
        alEscuchar={alEscuchar}
        sinGuardar={false}
      />,
    )
    escucharEntera(container)
    expect(alEscuchar).toHaveBeenLastCalledWith("voces/p1/t-x-0.mp3")

    rerender(
      <VozParaFirmar
        piezaId="p1"
        version={6}
        datos={grabacion("voces/p1/t-x-1.mp3")}
        explicacion={null}
        alEscuchar={alEscuchar}
        sinGuardar={false}
      />,
    )
    expect(screen.queryByText("La escuchaste completa")).toBeNull()
    escucharEntera(container)
    expect(alEscuchar).toHaveBeenLastCalledWith("voces/p1/t-x-1.mp3")
    expect(screen.getByText("La escuchaste completa")).toBeInTheDocument()
  })

  it("without a voice, offers 'Preparar mi voz' in a neutral block with its cost on the button", async () => {
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion(null, { botones: BOTONES })}
        explicacion={null}
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    expect(screen.getByText("Falta preparar tu voz.")).toBeInTheDocument()
    // The ElevenLabs balance is WAV's: folded under "Detalle para WAV", never in her text.
    const detalle = screen.getByText("Detalle para WAV").closest("details") as HTMLElement
    expect(detalle).not.toHaveAttribute("open")
    expect(detalle).toContainElement(screen.getByText(BOTONES.saldoVoz))
    const boton = screen.getByRole("button", { name: "Preparar mi voz US$ 0,33" })
    fireEvent.click(boton)
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 5, false))
  })

  it("turns a voice that could not be made into an error block: the title, then the rest of the reason", () => {
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion(null)}
        explicacion="No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz."
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    const alerta = screen.getByRole("alert")
    expect(screen.getByText("No pude preparar tu voz.")).toHaveClass("text-error")
    expect(alerta).toHaveTextContent("Vuelve a intentarlo con Preparar mi voz.")
    expect(screen.getByRole("button", { name: "Preparar mi voz" })).toBeInTheDocument()
  })

  it("says a provider's reason in her words and folds it under 'Detalle para WAV'", () => {
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion(null, { botones: BOTONES })}
        explicacion="No pude preparar tu voz. ElevenLabs respondió 401: la llave no sirve."
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    // One fold per block: the reason and the balance go together.
    expect(screen.getAllByText("Detalle para WAV")).toHaveLength(1)
    const alerta = screen.getByRole("alert")
    expect(alerta).toHaveTextContent("Vuelve a intentarlo con Preparar mi voz.")
    const detalle = screen.getByText("Detalle para WAV").closest("details") as HTMLElement
    expect(detalle).toContainElement(screen.getByText("ElevenLabs respondió 401: la llave no sirve."))
    expect(screen.getByRole("link", { name: "Abrir ElevenLabs" })).toBeInTheDocument()
  })

  it("says a short ElevenLabs balance in her words on the closed button, with the numbers for WAV", () => {
    const sinCaracteres =
      "No te alcanzan los caracteres de ElevenLabs (te quedan 100 y esta voz usa 1.100). Recarga o mejora tu plan en elevenlabs.io, en Suscripción."
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion(null, { botones: { ...BOTONES, bloqueoVoz: sinCaracteres } })}
        explicacion={null}
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    const accion = screen.getByRole("button", { name: /^Preparar mi voz/ })
    expect(accion).toHaveAccessibleDescription("No alcanza el saldo para preparar tu voz. Avísale a Federico.")
    const detalle = screen.getByText("Detalle para WAV").closest("details") as HTMLElement
    expect(detalle).toContainElement(screen.getByText(sinCaracteres))
  })

  it("keeps 'Preparar mi voz' closed while the script has unsaved changes, and says why", () => {
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion(null)}
        explicacion={null}
        alEscuchar={vi.fn()}
        sinGuardar
      />,
    )
    const accion = screen.getByRole("button", { name: "Preparar mi voz" })
    expect(accion).toHaveAttribute("aria-disabled", "true")
    expect(accion).toHaveAccessibleDescription("Guarda tus cambios antes de grabar tu voz.")
    fireEvent.click(accion)
    expect(pedirVozAccion).not.toHaveBeenCalled()
  })

  it("keeps 'Preparar mi voz' closed with the text of what does not reach", () => {
    const datos = grabacion(null, { botones: { ...BOTONES, bloqueoVoz: TOPE } })
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={datos}
        explicacion={null}
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    const accion = screen.getByRole("button", { name: /^Preparar mi voz/ })
    expect(accion).toHaveAttribute("aria-disabled", "true")
    expect(accion).toHaveAccessibleDescription(TOPE)
  })

  it("says her voice is being made as a polite working line", () => {
    const datos = grabacion(null, { estado: "grabando_voz" })
    render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={datos}
        explicacion={null}
        alEscuchar={vi.fn()}
        sinGuardar={false}
      />,
    )
    expect(screen.getByRole("status")).toHaveTextContent("Estoy preparando tu voz. Tarda unos segundos.")
  })
})

describe("GrabarDeNuevo", () => {
  it("makes a new take of the same text, with its cost on the right", async () => {
    render(
      <GrabarDeNuevo
        piezaId="p1"
        version={5}
        datos={grabacion("voces/p1/t-x-0.mp3", { botones: BOTONES })}
        sinGuardar={false}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grabar la voz de nuevo US$ 0,33" }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 5, true))
    expect(screen.getByText("Detalle para WAV").closest("details")).toContainElement(screen.getByText(BOTONES.saldoVoz))
  })

  it("stays closed while the script has unsaved changes, and says why", () => {
    render(<GrabarDeNuevo piezaId="p1" version={5} datos={grabacion("voces/p1/t-x-0.mp3")} sinGuardar />)
    const accion = screen.getByRole("button", { name: "Grabar la voz de nuevo" })
    expect(accion).toHaveAttribute("aria-disabled", "true")
    expect(accion).toHaveAccessibleDescription("Guarda tus cambios antes de grabar tu voz.")
  })
})
