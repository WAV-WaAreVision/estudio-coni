import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { VozParaFirmar } from "@/app/(app)/guion/[id]/voz-para-firmar"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({ pedirVozAccion: vi.fn() }))

const SEGUNDOS = 20

function grabacion(clave: string): DatosDeGrabacion {
  return {
    estado: "guion_por_aprobar",
    voz: { url: `https://almacen.test/${clave}`, clave },
    botones: null,
    lineaDeFirma: "Al firmar grabo el video. Tienes 8 s para deshacer.",
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
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("VozParaFirmar", () => {
  it("treats another take as unheard: the player starts over and reports the new take once she hears it", () => {
    const alEscuchar = vi.fn()
    const { container, rerender } = render(
      <VozParaFirmar piezaId="p1" version={5} datos={grabacion("voces/p1/t-x-0.mp3")} alEscuchar={alEscuchar} />,
    )
    escucharEntera(container)
    expect(alEscuchar).toHaveBeenLastCalledWith("voces/p1/t-x-0.mp3")

    rerender(<VozParaFirmar piezaId="p1" version={6} datos={grabacion("voces/p1/t-x-1.mp3")} alEscuchar={alEscuchar} />)
    expect(screen.queryByText("Ya la escuchaste")).toBeNull()
    expect(alEscuchar).toHaveBeenCalledTimes(1)

    escucharEntera(container)
    expect(alEscuchar).toHaveBeenLastCalledWith("voces/p1/t-x-1.mp3")
    expect(screen.getByText("Ya la escuchaste")).toBeInTheDocument()
  })
})
