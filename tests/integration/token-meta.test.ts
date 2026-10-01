import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { mantenerTokenMeta } from "@/lib/mantenimiento/token-meta"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { EXPLICACION_RECONECTAR } from "@/lib/proveedores/instagram"
import { simularInstagram } from "../instagram-msw"
import { servidor } from "../msw"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const TOKEN = "IGAA_token_actual_de_coni"
const DIA = 86_400_000
const AHORA = "2031-03-14T12:00:00.000Z"

function enDias(dias: number): string {
  return new Date(Date.parse(AHORA) + dias * DIA).toISOString()
}

async function expiraEn(dias: number | null) {
  await pool.query("update public.ajustes set meta_token_expira_en = $1", [dias === null ? null : enDias(dias)])
}

async function secreto(): Promise<string | null> {
  const { rows } = await pool.query<{ s: string }>(
    "select decrypted_secret as s from vault.decrypted_secrets where name = 'meta'",
  )
  return rows[0]?.s ?? null
}

async function expiracion(): Promise<string | null> {
  const { rows } = await pool.query<{ e: string | null }>("select meta_token_expira_en as e from public.ajustes")
  const valor = rows[0]?.e
  return valor ? new Date(valor).toISOString() : null
}

function doble() {
  const avisos = notificadorEnMemoria()
  return { deps: { db: clienteDeServicio(), avisos, ahora: () => AHORA }, avisos }
}

beforeEach(async () => {
  await pool.query("delete from vault.secrets where name = 'meta'")
  await pool.query("select vault.create_secret($1, 'meta')", [TOKEN])
  await expiraEn(20)
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'meta'")
  await pool.query("update public.ajustes set meta_token_expira_en = null")
})

describe("mantenerTokenMeta", () => {
  it("does nothing while the token has 10 days or more left", async () => {
    await expiraEn(10)
    const sim = simularInstagram({ cuenta: "1" })
    const { deps, avisos } = doble()

    expect(await mantenerTokenMeta(deps)).toBe("vigente")

    expect(sim.renovaciones).toEqual([])
    expect(avisos.aConiEnviados).toEqual([])
    expect(await secreto()).toBe(TOKEN)
  })

  it("does nothing when Coni has not connected Instagram yet", async () => {
    await pool.query("delete from vault.secrets where name = 'meta'")
    const sim = simularInstagram({ cuenta: "1" })
    const { deps, avisos } = doble()

    expect(await mantenerTokenMeta(deps)).toBe("sin_token")

    expect(sim.renovaciones).toEqual([])
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("renews the token when less than 10 days are left and saves the new token and its date together", async () => {
    await expiraEn(9)
    const sim = simularInstagram({ cuenta: "1" })
    const { deps, avisos } = doble()

    expect(await mantenerTokenMeta(deps)).toBe("renovado")

    expect(sim.renovaciones).toEqual([TOKEN])
    expect(await secreto()).toBe("IGAA_renovado")
    expect(await expiracion()).toBe(new Date(Date.parse(AHORA) + 5_183_944 * 1000).toISOString())
    expect(avisos.aConiEnviados).toEqual([])
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("tries to renew a token whose date is unknown", async () => {
    await expiraEn(null)
    const sim = simularInstagram({ cuenta: "1" })
    const { deps } = doble()

    expect(await mantenerTokenMeta(deps)).toBe("renovado")

    expect(sim.renovaciones).toHaveLength(1)
    expect(await expiracion()).not.toBeNull()
  })

  it("asks Coni to reconnect, and tells WAV, when Instagram says the token is dead", async () => {
    await expiraEn(5)
    servidor.use(
      http.get("https://graph.instagram.com/refresh_access_token", () =>
        HttpResponse.json(
          { error: { message: "Session has expired", code: 190, error_subcode: 463 } },
          { status: 400 },
        ),
      ),
    )
    const { deps, avisos } = doble()

    expect(await mantenerTokenMeta(deps)).toBe("fallo")

    expect(avisos.aConiEnviados).toEqual([{ mensaje: EXPLICACION_RECONECTAR, urgente: true }])
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(await secreto()).toBe(TOKEN)
  })

  it("tells Coni how many days are left when a temporary failure stops the renewal inside the last week, and raises it", async () => {
    await expiraEn(5)
    servidor.use(
      http.get(
        "https://graph.instagram.com/refresh_access_token",
        () => new HttpResponse("Bad gateway", { status: 502 }),
      ),
    )
    const { deps, avisos } = doble()

    await expect(mantenerTokenMeta(deps)).rejects.toThrow(/HTTP 502/)

    expect(avisos.aConiEnviados).toHaveLength(1)
    expect(avisos.aConiEnviados[0]?.mensaje).toContain("5 días")
    expect(await secreto()).toBe(TOKEN)
  })

  it("only raises a temporary failure while there is still more than a week", async () => {
    await expiraEn(8)
    servidor.use(
      http.get(
        "https://graph.instagram.com/refresh_access_token",
        () => new HttpResponse("Bad gateway", { status: 502 }),
      ),
    )
    const { deps, avisos } = doble()

    await expect(mantenerTokenMeta(deps)).rejects.toThrow(/HTTP 502/)

    expect(avisos.aConiEnviados).toEqual([])
  })

  it("tells WAV, not Coni, about a refusal that is not an expired token while there is time", async () => {
    await expiraEn(8)
    servidor.use(
      http.get("https://graph.instagram.com/refresh_access_token", () =>
        HttpResponse.json({ error: { message: "Cannot refresh", code: 100 } }, { status: 400 }),
      ),
    )
    const { deps, avisos } = doble()

    expect(await mantenerTokenMeta(deps)).toBe("fallo")

    expect(avisos.aConiEnviados).toEqual([])
    expect(avisos.aWavEnviados).toHaveLength(1)
  })
})
