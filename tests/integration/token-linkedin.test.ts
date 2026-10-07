import { afterAll, afterEach, describe, expect, it } from "vitest"
import { mantenerTokenLinkedin } from "@/lib/mantenimiento/token-linkedin"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

const DIA = 86_400_000
const AHORA = "2026-10-08T06:00:00.000Z"

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})
afterAll(() => pool.end())

async function conectadaHasta(ms: number) {
  await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
  await pool.query(
    "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_conectado_en = now(), linkedin_token_expira_en = $1",
    [new Date(Date.parse(AHORA) + ms).toISOString()],
  )
}

const deps = (avisos = notificadorEnMemoria(), ahora = AHORA) => ({
  db: clienteDeServicio(),
  avisos,
  ahora: () => ahora,
})

describe("mantenerTokenLinkedin", () => {
  it("does nothing without a connection", async () => {
    expect(await mantenerTokenLinkedin(deps())).toBe("sin_conexion")
  })

  it("does nothing with more than 14 days left", async () => {
    await conectadaHasta(20 * DIA)
    const avisos = notificadorEnMemoria()
    expect(await mantenerTokenLinkedin(deps(avisos))).toBe("vigente")
    expect(avisos.aConiEnviados).toHaveLength(0)
  })

  it.each([
    [
      10 * DIA,
      14,
      "Tu conexión con LinkedIn vence en 10 días. Entra a Ajustes y toca Renovar LinkedIn: toma un minuto. Si no, tus videos te quedarán para subir a mano.",
    ],
    [
      2 * DIA,
      3,
      "Tu conexión con LinkedIn vence en 2 días. Entra a Ajustes y toca Renovar LinkedIn: toma un minuto. Si no, tus videos te quedarán para subir a mano.",
    ],
    [
      -DIA,
      0,
      "Tu conexión con LinkedIn venció. Mientras no la renueves en Ajustes, tus videos de LinkedIn te quedarán para subir a mano.",
    ],
  ])(
    "handles %s ms left when it is the threshold %s: one notice per threshold and token",
    async (ms, umbral, mensaje) => {
      await conectadaHasta(ms)
      const avisos = notificadorEnMemoria()
      expect(await mantenerTokenLinkedin(deps(avisos))).toBe("avisado")
      expect(avisos.aConiEnviados[0]).toMatchObject({ mensaje })
      expect(avisos.avisosEnviados[0]).toMatchObject({ tipo: "linkedin_por_vencer" })
      expect(avisos.avisosEnviados[0]?.clave).toMatch(new RegExp(`^linkedin_por_vencer:${umbral}:`))
    },
  )

  it("tells WAV every night, with or without a connection, once the API version is 10 months old", async () => {
    const aTiempo = notificadorEnMemoria()
    await mantenerTokenLinkedin(deps(aTiempo, "2027-06-30T06:00:00.000Z"))
    expect(aTiempo.aWavEnviados).toHaveLength(0)

    const vieja = notificadorEnMemoria()
    expect(await mantenerTokenLinkedin(deps(vieja, "2027-07-02T06:00:00.000Z"))).toBe("sin_conexion")
    expect(vieja.aWavEnviados).toHaveLength(1)
    expect(vieja.aWavEnviados[0]?.detalle).toContain("VERSION_DE_LINKEDIN")
  })

  it("reads only the expiry in ajustes: it warns even if the token cannot be read", async () => {
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_conectado_en = now(), linkedin_token_expira_en = $1",
      [new Date(Date.parse(AHORA) + 2 * DIA).toISOString()],
    )
    const avisos = notificadorEnMemoria()
    expect(await mantenerTokenLinkedin(deps(avisos))).toBe("avisado")
    expect(avisos.aConiEnviados).toHaveLength(1)
  })
})
