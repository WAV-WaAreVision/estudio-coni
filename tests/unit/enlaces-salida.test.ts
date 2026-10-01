// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { resolverSalida } from "@/lib/enlaces/salida"

const AHORA = Date.parse("2026-10-10T02:00:00.000Z") // 23:00 on 9 Oct in Santiago
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"

const ENLACES = [
  { id: "agenda", titulo: "Agenda", detalle: "", url: "https://agenda.test/coni" },
  { id: "libros", titulo: "Libros", detalle: "", url: "https://libros.test" },
]

function armar(opciones: { cabeceras?: Record<string, string>; cuenta?: boolean; enlaces?: typeof ENLACES } = {}) {
  const registrarClic = vi.fn().mockResolvedValue(opciones.cuenta ?? true)
  const deps = {
    leerEnlaces: vi.fn().mockResolvedValue(opciones.enlaces ?? ENLACES),
    registrarClic,
    ahora: () => AHORA,
    zona: "America/Santiago",
    secreto: "secreto",
  }
  const cabeceras = new Headers({ "user-agent": IPHONE, "x-forwarded-for": "190.20.30.40", ...opciones.cabeceras })
  return { deps, cabeceras, registrarClic }
}

describe("resolverSalida", () => {
  it("sends a person to the link and counts one click for the day in Santiago", async () => {
    const { deps, cabeceras, registrarClic } = armar()

    const salida = await resolverSalida({ enlace: "agenda", cabeceras, deps })

    expect(salida).toEqual({ destino: "https://agenda.test/coni", contado: true })
    expect(registrarClic).toHaveBeenCalledTimes(1)
    const [enlace, huella, dia] = registrarClic.mock.calls[0] ?? []
    expect(enlace).toBe("agenda")
    expect(huella).toMatch(/^[0-9a-f]{64}$/)
    expect(dia).toBe("2026-10-09")
  })

  it("never hands the address or the device to the database", async () => {
    const { deps, cabeceras, registrarClic } = armar()

    await resolverSalida({ enlace: "agenda", cabeceras, deps })

    expect(JSON.stringify(registrarClic.mock.calls)).not.toContain("190.20.30.40")
    expect(JSON.stringify(registrarClic.mock.calls)).not.toContain("iPhone")
  })

  it("sends the same person to the link again without counting it twice", async () => {
    const { deps, cabeceras } = armar({ cuenta: false })

    const salida = await resolverSalida({ enlace: "agenda", cabeceras, deps })

    expect(salida).toEqual({ destino: "https://agenda.test/coni", contado: false })
  })

  it("asks with the same hash on a repeat and with another one for another person", async () => {
    const a = armar()
    await resolverSalida({ enlace: "agenda", cabeceras: a.cabeceras, deps: a.deps })
    await resolverSalida({ enlace: "agenda", cabeceras: a.cabeceras, deps: a.deps })
    const otra = armar({ cabeceras: { "x-forwarded-for": "200.1.1.1" } })
    await resolverSalida({ enlace: "agenda", cabeceras: otra.cabeceras, deps: a.deps })

    const huellas = a.registrarClic.mock.calls.map((llamada) => llamada[1])
    expect(huellas[0]).toBe(huellas[1])
    expect(huellas[2]).not.toBe(huellas[0])
  })

  it.each([
    ["a link scanner", { "user-agent": "facebookexternalhit/1.1" }],
    ["a prefetch", { "sec-purpose": "prefetch" }],
    ["a script", { "user-agent": "curl/8.4.0" }],
  ])("sends %s on its way without counting it", async (_nombre, cabecerasBot) => {
    const { deps, cabeceras, registrarClic } = armar({ cabeceras: cabecerasBot })

    const salida = await resolverSalida({ enlace: "agenda", cabeceras, deps })

    expect(salida).toEqual({ destino: "https://agenda.test/coni", contado: false })
    expect(registrarClic).not.toHaveBeenCalled()
  })

  it("does not count a request that only asks where the link goes", async () => {
    const { deps, cabeceras, registrarClic } = armar()

    const salida = await resolverSalida({ enlace: "agenda", cabeceras, deps, contar: false })

    expect(salida).toEqual({ destino: "https://agenda.test/coni", contado: false })
    expect(registrarClic).not.toHaveBeenCalled()
  })

  it("sends a link that does not exist, or is hidden, back to the page instead of an error", async () => {
    const { deps, cabeceras, registrarClic } = armar()

    expect(await resolverSalida({ enlace: "no-existe", cabeceras, deps })).toEqual({ destino: "/l", contado: false })
    expect(await resolverSalida({ enlace: "x".repeat(200), cabeceras, deps })).toEqual({
      destino: "/l",
      contado: false,
    })
    expect(registrarClic).not.toHaveBeenCalled()
  })

  it("still sends the person to the link when counting fails", async () => {
    const { deps, cabeceras, registrarClic } = armar()
    registrarClic.mockRejectedValue(new Error("base caída"))
    const registrar = vi.fn()

    const salida = await resolverSalida({ enlace: "agenda", cabeceras, deps: { ...deps, avisarFalla: registrar } })

    expect(salida).toEqual({ destino: "https://agenda.test/coni", contado: false })
    expect(registrar).toHaveBeenCalledTimes(1)
  })

  it("sends a person on without counting when the links cannot be read", async () => {
    const { deps, cabeceras } = armar()
    deps.leerEnlaces.mockRejectedValue(new Error("base caída"))
    const registrar = vi.fn()

    const salida = await resolverSalida({ enlace: "agenda", cabeceras, deps: { ...deps, avisarFalla: registrar } })

    expect(salida).toEqual({ destino: "/l", contado: false })
    expect(registrar).toHaveBeenCalledTimes(1)
  })
})
