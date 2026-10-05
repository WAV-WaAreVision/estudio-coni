import { fireEvent, render, screen, within } from "@testing-library/react"
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
  montoVoz: "US$ 0,33",
  unidadVoz: "~1.100 caracteres",
  montoVideo: "US$ 3,73",
  unidadVideo: "~56 s · incluye la voz",
  confirmacionVideo: "¿Grabar el video? Cuesta unos US$ 3,73.",
  saldoVoz: "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
  saldoVideo: "Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen.",
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

const CONVOZ = { url: "https://almacen.test/v.mp3", clave: "v.mp3" }

describe("BarraDeGrabacion", () => {
  it("without a voice the one principal in the bar is Grabar voz, with its cost on the right and its balance under", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    const barra = screen.getByRole("region", { name: "Grabación" })
    expect(barra).toHaveClass("fixed", "bottom-0")
    fireEvent.click(within(barra).getByRole("button", { name: "Grabar voz" }))
    expect(pedirVozAccion).toHaveBeenCalledWith("p", 3, false)
    expect(within(barra).getByText("US$ 0,33")).toHaveClass("tabular-nums")
    expect(within(barra).getByText("~1.100 caracteres")).toBeInTheDocument()
    expect(within(barra).getByText(BOTONES.saldoVoz)).toBeInTheDocument()
  })

  it("without a voice, the video is a secondary in the flow that says it includes the voice and asks before spending", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    const seccion = screen.getByRole("region", { name: "Video" })
    expect(within(seccion).getByText("~56 s · incluye la voz")).toBeInTheDocument()
    fireEvent.click(within(seccion).getByRole("button", { name: "Grabar video" }))
    expect(pedirVideoAccion).not.toHaveBeenCalled()
    expect(screen.getByText(BOTONES.confirmacionVideo)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, grabar" }))
    expect(pedirVideoAccion).toHaveBeenCalledWith("p", 3)
  })

  it("with a voice, the player and a record-again secondary are in the flow and the bar holds Grabar video", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos({ voz: CONVOZ })} />)
    const voz = screen.getByRole("region", { name: "Voz" })
    expect(within(voz).getByRole("button", { name: "Escuchar la voz" })).toBeInTheDocument()
    fireEvent.click(within(voz).getByRole("button", { name: "Volver a grabar voz" }))
    expect(pedirVozAccion).toHaveBeenCalledWith("p", 3, true)
    const barra = screen.getByRole("region", { name: "Grabación" })
    expect(within(barra).getByRole("button", { name: "Grabar video" })).toBeInTheDocument()
    expect(within(barra).getByText("US$ 3,73")).toBeInTheDocument()
  })

  it("puts the cost right of the one principal and asks before spending", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos({ voz: CONVOZ })} />)
    fireEvent.click(
      within(screen.getByRole("region", { name: "Grabación" })).getByRole("button", { name: "Grabar video" }),
    )
    expect(pedirVideoAccion).not.toHaveBeenCalled()
    expect(screen.getByText(/¿Grabar el video\? Cuesta unos US\$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, grabar" }))
    expect(pedirVideoAccion).toHaveBeenCalledWith("p", 3)
  })

  it("has no bar when the balance does not reach: the action is disabled in the flow and the block reads under the header", () => {
    const bloqueo = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,73)."
    render(
      <BarraDeGrabacion
        piezaId="p"
        version={3}
        datos={datos({ voz: CONVOZ, botones: { ...BOTONES, bloqueoVideo: bloqueo } })}
      />,
    )
    expect(screen.queryByRole("region", { name: "Grabación" })).toBeNull()
    expect(screen.getByRole("button", { name: "Grabar video" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(bloqueo)).toBeInTheDocument()
    expect(screen.getByText("US$ 3,73")).toBeInTheDocument()
  })

  it("has no bar while the voice is being recorded, and says so with the working dot", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos({ estado: "grabando_voz" })} />)
    expect(screen.queryByRole("region", { name: "Grabación" })).toBeNull()
    expect(screen.getByText("Grabando la voz · unos segundos")).toBeInTheDocument()
    expect(document.querySelector(".punto-trabajando")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Volver a revisar el guion" })).toHaveAttribute("aria-disabled", "true")
  })

  it("works without numbers when the setup does not read", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos({ botones: null })} />)
    fireEvent.click(screen.getByRole("button", { name: "Grabar voz" }))
    expect(pedirVozAccion).toHaveBeenCalledWith("p", 3, false)
  })

  it("reopens the script", () => {
    render(<BarraDeGrabacion piezaId="p" version={3} datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Volver a revisar el guion" }))
    expect(reabrirGuionAccion).toHaveBeenCalledWith("p", 3)
  })

  it("renders what the screen puts between the voice and the end", () => {
    render(
      <BarraDeGrabacion piezaId="p" version={3} datos={datos()}>
        <p>El guion en lectura</p>
      </BarraDeGrabacion>,
    )
    expect(screen.getByText("El guion en lectura")).toBeInTheDocument()
  })
})
