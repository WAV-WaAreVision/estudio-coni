import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AvisosDelCelular } from "@/app/(app)/ajustes/avisos-del-celular"
import type { Resultado } from "@/lib/acciones/resultado"
import type { DatosDelDispositivo, PuertoDeAvisos } from "@/lib/avisos/navegador"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const CLAVE = "clave-publica-vapid"
const SUSCRIPCION = { endpoint: "https://push.example.test/abc", p256dh: "p", auth: "a", userAgent: "Safari" }

const INSTALADO: DatosDelDispositivo = {
  ios: true,
  instalada: true,
  soportado: true,
  permiso: "default",
  suscrito: false,
}

function puerto(
  dispositivo: Partial<DatosDelDispositivo> = {},
  cambios: Partial<PuertoDeAvisos> = {},
): PuertoDeAvisos & { activar: ReturnType<typeof vi.fn>; desactivar: ReturnType<typeof vi.fn> } {
  return {
    leer: async () => ({ ...INSTALADO, ...dispositivo }),
    activar: vi.fn(async () => ({ estado: "activada" as const, suscripcion: SUSCRIPCION })),
    desactivar: vi.fn(async () => SUSCRIPCION.endpoint),
    ...cambios,
  } as PuertoDeAvisos & { activar: ReturnType<typeof vi.fn>; desactivar: ReturnType<typeof vi.fn> }
}

const ok = async (): Promise<Resultado> => ({ ok: true })

function acciones(cambios: Partial<Parameters<typeof AvisosDelCelular>[0]["acciones"]> = {}) {
  return {
    guardar: vi.fn(ok),
    quitar: vi.fn(ok),
    probar: vi.fn(async (): Promise<Resultado<{ enviados: number }>> => ({ ok: true, enviados: 1 })),
    ...cambios,
  }
}

function mostrar(p: PuertoDeAvisos, a = acciones(), claveVapid: string | null = CLAVE): ReturnType<typeof acciones> {
  render(<AvisosDelCelular claveVapid={claveVapid} acciones={a} puerto={p} />)
  return a
}

describe("AvisosDelCelular", () => {
  it("shows the install sheet to an iPhone that opened the app in Safari, step by step", async () => {
    mostrar(puerto({ instalada: false, soportado: false, permiso: null }))

    expect(await screen.findByText("Agrégala a tu pantalla de inicio")).toBeInTheDocument()
    expect(screen.getByText(/Compartir/)).toBeInTheDocument()
    expect(screen.getByText(/Agregar a inicio/)).toBeInTheDocument()
    expect(screen.getByText(/iOS 16\.4/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Activar avisos" })).not.toBeInTheDocument()
  })

  it("asks for the permission only when she taps, saves the device and then offers a test", async () => {
    const p = puerto()
    const a = mostrar(p)

    const activar = await screen.findByRole("button", { name: "Activar avisos" })
    expect(p.activar).not.toHaveBeenCalled()
    fireEvent.click(activar)

    expect(await screen.findByText("Avisos activados en este celular")).toBeInTheDocument()
    expect(p.activar).toHaveBeenCalledWith(CLAVE)
    expect(a.guardar).toHaveBeenCalledWith(SUSCRIPCION)
    expect(screen.getByRole("button", { name: "Enviar uno de prueba" })).toBeInTheDocument()
  })

  it("tells her how to turn notices on again in the iPhone settings when she said no", async () => {
    const p = puerto({}, { activar: vi.fn(async () => ({ estado: "denegada" as const })) })
    const a = mostrar(p)

    fireEvent.click(await screen.findByRole("button", { name: "Activar avisos" }))

    expect(await screen.findByText("Los avisos están bloqueados")).toBeInTheDocument()
    expect(screen.getByText(/Notificaciones/)).toBeInTheDocument()
    expect(screen.getByText(/Estudio de Coni/)).toBeInTheDocument()
    expect(a.guardar).not.toHaveBeenCalled()
  })

  it("starts blocked when the browser already says so", async () => {
    mostrar(puerto({ permiso: "denied" }))

    expect(await screen.findByText("Los avisos están bloqueados")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Activar avisos" })).not.toBeInTheDocument()
  })

  it("starts on when the device is already subscribed", async () => {
    mostrar(puerto({ permiso: "granted", suscrito: true }))

    expect(await screen.findByText("Avisos activados en este celular")).toBeInTheDocument()
  })

  it("sends a test and says it was sent", async () => {
    const a = mostrar(puerto({ permiso: "granted", suscrito: true }))

    fireEvent.click(await screen.findByRole("button", { name: "Enviar uno de prueba" }))

    expect(await screen.findByText(/te lo mandé/i)).toBeInTheDocument()
    expect(a.probar).toHaveBeenCalledTimes(1)
  })

  it("shows what went wrong with the test, in words", async () => {
    const a = acciones({
      probar: vi.fn(async () => ({ ok: false as const, error: "No pude mandarlo ahora. Inténtalo en unos minutos." })),
    })
    mostrar(puerto({ permiso: "granted", suscrito: true }), a)

    fireEvent.click(await screen.findByRole("button", { name: "Enviar uno de prueba" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("No pude mandarlo ahora. Inténtalo en unos minutos.")
  })

  it("turns the notices off: removes the subscription from the phone and from the server", async () => {
    const p = puerto({ permiso: "granted", suscrito: true })
    const a = mostrar(p)

    fireEvent.click(await screen.findByRole("button", { name: "Desactivar avisos" }))

    await waitFor(() => expect(screen.getByRole("button", { name: "Activar avisos" })).toBeInTheDocument())
    expect(p.desactivar).toHaveBeenCalledTimes(1)
    expect(a.quitar).toHaveBeenCalledWith(SUSCRIPCION.endpoint)
  })

  it("does not say they are on when the server could not save the device, and lets go of the subscription", async () => {
    const p = puerto()
    const a = acciones({ guardar: vi.fn(async () => ({ ok: false as const, error: "Algo falló de nuestro lado." })) })
    mostrar(p, a)

    fireEvent.click(await screen.findByRole("button", { name: "Activar avisos" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado.")
    expect(screen.queryByText("Avisos activados en este celular")).not.toBeInTheDocument()
    expect(p.desactivar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Activar avisos" })).toBeInTheDocument()
  })

  it("says the phone cannot receive them, and that email will, when the browser has no push", async () => {
    mostrar(puerto({ soportado: false, permiso: null }))

    expect(await screen.findByText("Este celular no puede recibir avisos")).toBeInTheDocument()
    expect(screen.getByText(/correo/)).toBeInTheDocument()
  })

  it("says they are not ready yet while the server has no keys", async () => {
    mostrar(puerto(), acciones(), null)

    expect(await screen.findByText("Este celular no puede recibir avisos")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Activar avisos" })).not.toBeInTheDocument()
  })

  it("never writes an em dash", async () => {
    const { container } = render(
      <AvisosDelCelular
        claveVapid={CLAVE}
        acciones={acciones()}
        puerto={puerto({ instalada: false, soportado: false, permiso: null })}
      />,
    )
    await screen.findByText("Agrégala a tu pantalla de inicio")
    expect(container.textContent).not.toContain("—")
  })
})
