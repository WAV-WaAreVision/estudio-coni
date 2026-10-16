import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { VozParaFirmar } from "@/app/(app)/guion/[id]/voz-para-firmar"
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

function grabacion(clave: string | null, sobre: Partial<DatosDeGrabacion> = {}): DatosDeGrabacion {
  return {
    estado: "guion_por_aprobar",
    voz: clave === null ? null : { url: `https://almacen.test/${clave}`, clave },
    botones: null,
    lineaDeFirma: "Al firmar grabo el video. Tienes 8 s para deshacer.",
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
  it("treats another take as unheard: the player starts over and reports the new take once she hears it", () => {
    const alEscuchar = vi.fn()
    const { container, rerender } = render(
      <VozParaFirmar
        piezaId="p1"
        version={5}
        datos={grabacion("voces/p1/t-x-0.mp3")}
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
        alEscuchar={alEscuchar}
        sinGuardar={false}
      />,
    )
    expect(screen.queryByText("La escuchaste completa")).toBeNull()
    expect(alEscuchar).toHaveBeenCalledTimes(1)

    escucharEntera(container)
    expect(alEscuchar).toHaveBeenLastCalledWith("voces/p1/t-x-1.mp3")
    expect(screen.getByText("La escuchaste completa")).toBeInTheDocument()
  })

  it.each([
    ["Grabar la voz de nuevo", "voces/p1/t-x-0.mp3"],
    ["Preparar mi voz", null],
  ])("keeps %s closed while the script has unsaved changes, and says why", (boton, clave) => {
    render(<VozParaFirmar piezaId="p1" version={5} datos={grabacion(clave)} alEscuchar={vi.fn()} sinGuardar />)
    const accion = screen.getByRole("button", { name: boton })

    expect(accion).toHaveAttribute("aria-disabled", "true")
    expect(accion).toHaveAccessibleDescription("Guarda tus cambios antes de grabar tu voz.")
    fireEvent.click(accion)
    expect(pedirVozAccion).not.toHaveBeenCalled()
  })

  it.each([
    ["Grabar la voz de nuevo", "voces/p1/t-x-0.mp3"],
    ["Preparar mi voz", null],
  ])("keeps %s closed with the text of what does not reach", (boton, clave) => {
    const bloqueo = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes o espera al próximo mes."
    const datos = grabacion(clave, { botones: { ...BOTONES, bloqueoVoz: bloqueo } })
    render(<VozParaFirmar piezaId="p1" version={5} datos={datos} alEscuchar={vi.fn()} sinGuardar={false} />)
    const accion = screen.getByRole("button", { name: boton })

    expect(accion).toHaveAttribute("aria-disabled", "true")
    expect(accion).toHaveAccessibleDescription(bloqueo)
  })

  it("says her voice is being made as a polite status", () => {
    const datos = grabacion(null, { estado: "grabando_voz" })
    render(<VozParaFirmar piezaId="p1" version={5} datos={datos} alEscuchar={vi.fn()} sinGuardar={false} />)

    expect(screen.getByRole("status")).toHaveTextContent("Estoy preparando tu voz. Tarda unos segundos.")
  })
})
