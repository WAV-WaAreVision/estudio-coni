import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { avisarAFederico, type DepsAvisar } from "@/lib/acciones/avisar-a-federico"
import { leerAvisoDeSaldo } from "@/lib/datos/aviso-a-federico"
import { asuntoDeAviso, claveDeAvisoDeSaldo, TEXTO_YA_NO_FALLA } from "@/lib/dominio/avisar-a-federico"
import { type NotificadorEnMemoria, notificadorEnMemoria } from "@/lib/proveedores/avisos"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { pool, sinLimiteFijado } from "./db"
import { GUION } from "./flujo"
import { clienteDeServicio, credencialesDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"
import { ajustarPieza, borrarSembrado, sembrarPieza } from "./siembra"

// The balances are read through the real wiring; the E2E switch turns its one-minute cache off, so each test's
// balances are the ones it sets.
vi.hoisted(() => {
  process.env.DISPARO_DE_PRUEBA = "1"
})

const TITULO = "Sexo y ansiedad"
const db = clienteDeServicio()
const piezas: string[] = []

function saldos(entrada: { caracteresUsados: number; heygenUsd: number }) {
  servidor.use(
    http.get("https://api.elevenlabs.io/v1/user/subscription", () =>
      HttpResponse.json({ character_count: entrada.caracteresUsados, character_limit: 100_000 }),
    ),
    http.get("https://api.heygen.com/v3/users/me", () =>
      HttpResponse.json({
        data: { billing_type: "wallet", wallet: { currency: "usd", remaining_balance: entrada.heygenUsd } },
      }),
    ),
  )
}

const SIN_CARACTERES = { caracteresUsados: 100_000, heygenUsd: 50 }
const SIN_HEYGEN = { caracteresUsados: 1000, heygenUsd: 0 }
const TODO_ALCANZA = { caracteresUsados: 1000, heygenUsd: 50 }

beforeAll(() => {
  const { url, clave } = credencialesDeServicio()
  process.env.SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = clave
})

beforeEach(async () => {
  await sinLimiteFijado()
  await pool.query("update public.ajustes set produccion = $1::jsonb, tope_mensual_usd = 40", [
    JSON.stringify(coniConfig),
  ])
  for (const nombre of ["elevenlabs", "heygen"]) {
    await pool.query("delete from vault.secrets where name = $1", [nombre])
    await pool.query("select vault.create_secret($1, $2)", [`llave-${nombre}`, nombre])
  }
})

afterEach(async () => {
  for (const nombre of ["elevenlabs", "heygen"]) await pool.query("delete from vault.secrets where name = $1", [nombre])
  await pool.query("update public.ajustes set produccion = '{}'::jsonb, tope_mensual_usd = 40")
  await pool.query("delete from public.avisos_a_federico")
  await pool.query("delete from public.pausas_de_proveedor")
  await sinLimiteFijado()
  await borrarSembrado(piezas.splice(0), [])
})

afterAll(async () => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.DISPARO_DE_PRUEBA
  await pool.end()
})

function deps(avisos: NotificadorEnMemoria): DepsAvisar {
  return { db, avisos: () => avisos }
}

async function piezaPorFirmar(): Promise<string> {
  const id = await sembrarPieza("guion_por_aprobar", { guion: GUION, titulo: TITULO })
  piezas.push(id)
  return id
}

describe("avisarAFederico for a balance that does not reach (#101, decision 1)", () => {
  it("emails WAV once per piece attempt for her voice, keyed by piece, motivo and attempt", async () => {
    saldos(SIN_CARACTERES)
    const id = await piezaPorFirmar()
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_voz" })).toEqual({ ok: true })
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_voz" })).toEqual({ ok: true })

    expect(avisos.aWavEnviados).toHaveLength(1)
    const [correo] = avisos.aWavEnviados
    expect(correo?.asunto).toBe(asuntoDeAviso(TITULO))
    expect(correo?.idempotencia).toBe(claveDeAvisoDeSaldo({ id, motivo: "saldo_voz", intento: 0 }))
    expect(correo?.detalle).toContain("Proveedor: ElevenLabs")
    expect(correo?.detalle).toMatch(/^Qué pasó: No te alcanzan los caracteres de ElevenLabs/m)
    expect(correo?.detalle).toMatch(/^Saldo: ElevenLabs: te quedan 0 de 100\.000 caracteres\./m)
    expect(correo?.detalle).toMatch(/^Estimado: US\$ \d+,\d\d · ~\d+ caracteres$/m)
    expect(correo?.detalle).toContain(`/guion/${id}`)
    const { rows } = await pool.query("select tipo, enviado_en from public.avisos_a_federico where entidad_id = $1", [
      id,
    ])
    expect(rows).toEqual([{ tipo: "pieza", enviado_en: expect.any(Date) }])

    // A new attempt that hits the balance again is told again.
    await ajustarPieza(id, { intento: 1 })
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_voz" })).toEqual({ ok: true })
    expect(avisos.aWavEnviados).toHaveLength(2)
  })

  it("emails WAV about HeyGen when the signature is closed by its balance", async () => {
    saldos(SIN_HEYGEN)
    const id = await piezaPorFirmar()
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_video" })).toEqual({ ok: true })

    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados[0]?.detalle).toContain("Proveedor: HeyGen")
    expect(avisos.aWavEnviados[0]?.detalle).toContain("Saldo: Saldo de API de HeyGen: US$ 0,00.")
    expect(avisos.aWavEnviados[0]?.idempotencia).toBe(claveDeAvisoDeSaldo({ id, motivo: "saldo_video", intento: 0 }))
  })

  it("refuses, and sends nothing, when the balance covers the estimate", async () => {
    saldos(TODO_ALCANZA)
    const id = await piezaPorFirmar()
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_voz" })).toEqual({
      ok: false,
      error: TEXTO_YA_NO_FALLA,
    })
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_video" })).toEqual({
      ok: false,
      error: TEXTO_YA_NO_FALLA,
    })
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("refuses while the provider is paused: WAV already got the pause's email", async () => {
    saldos({ caracteresUsados: 100_000, heygenUsd: 0 })
    await pool.query("select public.abrir_pausa_de_proveedor('elevenlabs', 'pago', 'x')")
    await pool.query("select public.abrir_pausa_de_proveedor('heygen', 'pago', 'x')")
    const id = await piezaPorFirmar()
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_voz" })).toEqual({
      ok: false,
      error: TEXTO_YA_NO_FALLA,
    })
    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_video" })).toEqual({
      ok: false,
      error: TEXTO_YA_NO_FALLA,
    })
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("refuses when the month's limit closes her voice: that one is hers to reactivate", async () => {
    saldos(SIN_CARACTERES)
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const id = await piezaPorFirmar()
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_voz" })).toEqual({
      ok: false,
      error: TEXTO_YA_NO_FALLA,
    })
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("refuses a piece that is no longer at gate 1", async () => {
    saldos(SIN_CARACTERES)
    const id = await sembrarPieza("en_render", { guion: GUION })
    piezas.push(id)
    const avisos = notificadorEnMemoria()

    expect(await avisarAFederico(deps(avisos), { tipo: "pieza", id, motivo: "saldo_voz" })).toEqual({
      ok: false,
      error: TEXTO_YA_NO_FALLA,
    })
    expect(avisos.aWavEnviados).toEqual([])
  })
})

describe("leerAvisoDeSaldo", () => {
  it("tells the page whether WAV's email for this balance block went out, with the same key", async () => {
    saldos(SIN_CARACTERES)
    const id = await piezaPorFirmar()
    const coni = await clienteDeConi()

    expect(await leerAvisoDeSaldo(coni, { id, motivo: "saldo_voz", intento: 0 })).toEqual({ avisado: false })
    await avisarAFederico(deps(notificadorEnMemoria()), { tipo: "pieza", id, motivo: "saldo_voz" })
    expect(await leerAvisoDeSaldo(coni, { id, motivo: "saldo_voz", intento: 0 })).toEqual({ avisado: true })
    expect(await leerAvisoDeSaldo(coni, { id, motivo: "saldo_video", intento: 0 })).toEqual({ avisado: false })
  })
})
