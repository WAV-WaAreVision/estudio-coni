import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BarraDeGrabacion } from "@/app/(app)/guion/[id]/barra-de-grabacion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"

const { pedirVozAccion, pedirVideoAccion, reabrirGuionAccion } = vi.hoisted(() => ({
  pedirVozAccion: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
  pedirVideoAccion: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
  reabrirGuionAccion: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
}))
vi.mock("@/app/(app)/piezas/acciones", () => ({ pedirVozAccion, pedirVideoAccion, reabrirGuionAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const BOTONES = {
  costoVoz: "Grabar voz: ~1.100 caracteres (US$ 0,33)",
  costoVideo: "Grabar video: ~56 s (US$ 3,73)",
  confirmacionVideo: "¿Grabar el video? Cuesta unos US$ 3,73.",
  saldoVoz: "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
  saldoVideo: "Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen.",
  tope: "Te quedan US$ 37,00 de tu tope de este mes.",
  bloqueoVoz: null,
  bloqueoVideo: null,
}
const datos = (cambios: Partial<DatosDeGrabacion> = {}): DatosDeGrabacion => ({
  estado: "guion_aprobado",
  voz: null,
  botones: BOTONES,
  ...cambios,
})

beforeEach(() => vi.clearAllMocks())

describe("BarraDeGrabacion", () => {
  it("offers Grabar voz with its cost and balance when there is no voice", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Grabar voz" }))
    expect(pedirVozAccion).toHaveBeenCalledWith("p", 3, false)
    expect(screen.getByText(BOTONES.costoVoz)).toBeInTheDocument()
    expect(screen.getByText(BOTONES.saldoVoz)).toBeInTheDocument()
  })

  it("plays the voice and offers to record it again as a new take", () => {
    render(
      <BarraDeGrabacion
        piezaId="p"
        version={3}
        datos={datos({ voz: { url: "https://almacen.test/v.mp3", clave: "v.mp3" } })}
      />,
    )
    expect(screen.getByRole("button", { name: "Escuchar la voz" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Volver a grabar voz" }))
    expect(pedirVozAccion).toHaveBeenCalledWith("p", 3, true)
  })

  it("asks once before recording the video", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Grabar video" }))
    expect(pedirVideoAccion).not.toHaveBeenCalled()
    expect(screen.getByText(BOTONES.confirmacionVideo)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, grabar" }))
    expect(pedirVideoAccion).toHaveBeenCalledWith("p", 3)
  })

  it("disables a button and says what to top up when the balance does not reach", () => {
    const bloqueo = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,73)."
    render(
      <BarraDeGrabacion piezaId="p" version={3} datos={datos({ botones: { ...BOTONES, bloqueoVideo: bloqueo } })} />,
    )
    expect(screen.getByRole("button", { name: "Grabar video" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(bloqueo)).toBeInTheDocument()
  })

  it("disables both while the voice is being recorded", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos({ estado: "grabando_voz" })} />)
    expect(screen.getByRole("button", { name: "Grabando la voz…" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Grabar video" })).toHaveAttribute("aria-disabled", "true")
  })

  it("reopens the script", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Volver a revisar el guion" }))
    expect(reabrirGuionAccion).toHaveBeenCalledWith("p", 3)
  })
})
