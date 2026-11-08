// @vitest-environment node
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/sesion/coni", () => ({ leerSesion: vi.fn(async () => ({ estado: "coni", db: {} })) }))
const terminar = vi.fn()
vi.mock("@/lib/acciones/instagram", async (original) => ({
  ...(await original<typeof import("@/lib/acciones/instagram")>()),
  terminarConexion: (...args: unknown[]) => terminar(...args),
}))
const avisar = vi.fn()
vi.mock("@/lib/acciones/conexion-fallida", () => ({
  avisarConexionFallida: (...args: unknown[]) => avisar(...args),
}))

afterEach(() => {
  terminar.mockReset()
  avisar.mockReset()
})

describe("/api/meta/callback (issue 111)", () => {
  it("tells WAV about a failure only WAV can fix and says so in the address only when it went out", async () => {
    const { GET } = await import("@/app/api/meta/callback/route")
    terminar.mockResolvedValue({ ok: false, motivo: "fallo" })
    avisar.mockResolvedValue(true)
    const avisado = await GET(new NextRequest("https://estudio.example/api/meta/callback?code=c1&state=s1"))
    expect(avisar.mock.calls[0]?.slice(1)).toEqual(["instagram", "fallo"])
    expect(avisado.headers.get("location")).toContain("/ajustes/cuentas?instagram=fallo&federico=avisado")

    avisar.mockResolvedValue(false)
    const sinAviso = await GET(new NextRequest("https://estudio.example/api/meta/callback?code=c1&state=s1"))
    expect(sinAviso.headers.get("location")).toMatch(/\/ajustes\/cuentas\?instagram=fallo$/)
  })

  it("does not tell WAV when the connection worked", async () => {
    terminar.mockResolvedValue({ ok: true, usuario: "coni" })
    const { GET } = await import("@/app/api/meta/callback/route")
    const respuesta = await GET(new NextRequest("https://estudio.example/api/meta/callback?code=c1&state=s1"))
    expect(avisar).not.toHaveBeenCalled()
    expect(respuesta.headers.get("location")).toContain("/ajustes/cuentas?instagram=conectada")
  })
})
