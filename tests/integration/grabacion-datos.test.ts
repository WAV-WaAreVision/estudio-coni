import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { leerDatosDeGrabacion, vozVigente } from "@/lib/datos/grabacion"
import { leerProduccion } from "@/lib/datos/repositorio"
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { claveVozAprobada } from "@/lib/proveedores/almacen"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { pool } from "./db"
import { GUION } from "./flujo"
import { clienteDeServicio, credencialesDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"
import { ajustarPieza, borrarSembrado, leerFila, sembrarPieza } from "./siembra"

const ZONA = "America/Santiago"
const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs
const HUELLA = huellaDelGuion(GUION, ELEVENLABS)
const creadas: string[] = []
let coni: Awaited<ReturnType<typeof clienteDeConi>>

beforeAll(async () => {
  coni = await clienteDeConi()
  // The wiring of the real reader builds its own service client from the environment, as the server does.
  const { url, clave } = credencialesDeServicio()
  process.env.SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = clave
})

beforeEach(async () => {
  await pool.query("update public.ajustes set produccion = $1::jsonb, tope_mensual_usd = 40", [
    JSON.stringify(coniConfig),
  ])
  for (const nombre of ["elevenlabs", "heygen"]) {
    await pool.query("delete from vault.secrets where name = $1", [nombre])
    await pool.query("select vault.create_secret($1, $2)", [`llave-${nombre}`, nombre])
  }
  servidor.use(
    http.get("https://api.elevenlabs.io/v1/user/subscription", () =>
      HttpResponse.json({ character_count: 1000, character_limit: 100_000 }),
    ),
    http.get("https://api.heygen.com/v3/users/me", () =>
      HttpResponse.json({ data: { billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 50 } } }),
    ),
  )
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const nombre of ["elevenlabs", "heygen"]) await pool.query("delete from vault.secrets where name = $1", [nombre])
  await pool.query("update public.ajustes set produccion = '{}'::jsonb, tope_mensual_usd = 40")
})

afterAll(async () => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  await borrarSembrado(creadas, [])
  await pool.end()
})

async function piezaAprobada(ajustes: Record<string, unknown> = {}) {
  const id = await sembrarPieza("en_render", ajustes)
  creadas.push(id)
  return id
}

async function piezaPorFirmar(ajustes: Record<string, unknown> = {}) {
  const id = await sembrarPieza("guion_por_aprobar", ajustes)
  creadas.push(id)
  return id
}

describe("leerDatosDeGrabacion", () => {
  it("reads the balances through the real wiring and prices voice and signature, no voice yet", async () => {
    const id = await piezaPorFirmar()
    const fila = await leerFila(id)

    const datos = await leerDatosDeGrabacion(coni, { fila, estado: "guion_por_aprobar", guion: GUION, zona: ZONA })

    expect(datos.estado).toBe("guion_por_aprobar")
    expect(datos.voz).toBeNull()
    expect(datos.botones?.saldoVoz).toMatch(/^ElevenLabs: te quedan 99\.000 de 100\.000 caracteres/)
    expect(datos.botones?.bloqueoVoz).toBeNull()
    expect(datos.botones?.bloqueoVideo).toBeNull()
    expect(datos.lineaDeFirma).toMatch(/^Graba el video · US\$ \d+,\d\d · 8 s para deshacer$/)
  })

  it("offers her voice of this script", async () => {
    const id = await piezaPorFirmar()
    const toma = claveDeToma(id, HUELLA, 0)
    await ajustarPieza(id, { audio_id: toma })

    const datos = await leerDatosDeGrabacion(coni, {
      fila: await leerFila(id),
      estado: "guion_por_aprobar",
      guion: GUION,
      zona: ZONA,
    })

    expect(datos.voz?.clave).toBe(toma)
  })

  it("blocks both buttons with the cap line when the month has no room left", async () => {
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const id = await piezaPorFirmar()

    const datos = await leerDatosDeGrabacion(coni, {
      fila: await leerFila(id),
      estado: "guion_por_aprobar",
      guion: GUION,
      zona: ZONA,
    })

    const linea = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes o espera al próximo mes."
    expect(datos.botones?.bloqueoVoz).toBe(linea)
    expect(datos.botones?.bloqueoVideo).toBe(linea)
  })

  it("does not offer a voice of another text or of another piece", async () => {
    const id = await piezaPorFirmar()
    const ajena = claveDeToma(id, huellaDelGuion("Otro texto.", ELEVENLABS), 0)
    await ajustarPieza(id, { audio_id: ajena })

    const datos = await leerDatosDeGrabacion(coni, {
      fila: await leerFila(id),
      estado: "guion_por_aprobar",
      guion: GUION,
      zona: ZONA,
    })

    expect(datos.voz).toBeNull()
  })

  it("does not block anything when a provider does not answer", async () => {
    servidor.use(http.get("https://api.heygen.com/v3/users/me", () => new HttpResponse("no", { status: 500 })))
    // A fresh module, so the one-minute cache of the earlier tests does not hide the failure.
    vi.resetModules()
    const { leerDatosDeGrabacion: leerNuevo } = await import("@/lib/datos/grabacion")
    const id = await piezaPorFirmar()

    const datos = await leerNuevo(coni, {
      fila: await leerFila(id),
      estado: "guion_por_aprobar",
      guion: GUION,
      zona: ZONA,
    })

    expect(datos.botones?.bloqueoVideo).toBeNull()
    expect(datos.botones?.bloqueoVoz).toBeNull()
  })

  it("answers without numbers, and logs, when the production setup does not read", async () => {
    await pool.query('update public.ajustes set produccion = \'{"ruta_voz": "ElevenLabs"}\'::jsonb')
    const id = await piezaPorFirmar()

    const datos = await leerDatosDeGrabacion(coni, {
      fila: await leerFila(id),
      estado: "grabando_voz",
      guion: GUION,
      zona: ZONA,
    })

    expect(datos).toEqual({
      estado: "grabando_voz",
      voz: null,
      botones: null,
      lineaDeFirma: "Graba el video · 8 s para deshacer",
      vozSinCobro: false,
    })
  })

  async function gastoDeVoz(
    piezaId: string,
    clave: string,
    cierre: "sin_cobro" | "barrido" | "abierto" | "confirmado",
  ) {
    await pool.query("select public.reservar_gasto($1, 'elevenlabs', 'voz', 0.2, $2, now())", [piezaId, clave])
    if (cierre === "sin_cobro") await pool.query("select public.liberar_gasto($1, true)", [clave])
    if (cierre === "barrido") await pool.query("select public.liberar_gasto($1)", [clave])
    if (cierre === "confirmado") await pool.query("select public.confirmar_gasto($1, 0.2)", [clave])
  }

  const claveDelIntento = (id: string, intento: number) => `${id}:voz:${"ab".repeat(8)}:${intento}`

  it.each([
    ["an earlier try of the attempt is still open after a 5xx", "abierto"],
    ["an earlier try of the attempt was paid and its upload failed", "confirmado"],
  ] as const)("does not say the attempt was not charged when %s", async (_caso, primera) => {
    const id = await piezaPorFirmar()
    const base = claveDelIntento(id, 0)
    await gastoDeVoz(id, base, primera)
    await gastoDeVoz(id, `${base}:r1`, "sin_cobro")
    const fila = await leerFila(id)

    const datos = await leerDatosDeGrabacion(coni, { fila, estado: "guion_por_aprobar", guion: GUION, zona: ZONA })

    expect(datos.vozSinCobro).toBe(false)
  })

  it("says it for an attempt whose every try was refused", async () => {
    const id = await piezaPorFirmar()
    const base = claveDelIntento(id, 0)
    await gastoDeVoz(id, base, "sin_cobro")
    await gastoDeVoz(id, `${base}:r1`, "sin_cobro")
    const fila = await leerFila(id)

    const datos = await leerDatosDeGrabacion(coni, { fila, estado: "guion_por_aprobar", guion: GUION, zona: ZONA })

    expect(datos.vozSinCobro).toBe(true)
  })

  it("does not carry an older attempt's refusal over a newer failure that reserved nothing, like the cap", async () => {
    const id = await piezaPorFirmar()
    await gastoDeVoz(id, claveDelIntento(id, 0), "sin_cobro")
    await ajustarPieza(id, { intento: 1 })
    const fila = await leerFila(id)

    const datos = await leerDatosDeGrabacion(coni, { fila, estado: "guion_por_aprobar", guion: GUION, zona: ZONA })

    expect(datos.vozSinCobro).toBe(false)
  })

  it.each([
    ["a refusal released it", "sin_cobro", true],
    ["the sweeper released it", "barrido", false],
    ["it is still open", "abierto", false],
  ] as const)("says the last voice attempt was not charged only when %s", async (_caso, cierre, esperado) => {
    const id = await piezaPorFirmar()
    await gastoDeVoz(id, `${id}:voz:${"ab".repeat(8)}:0`, cierre)
    const fila = await leerFila(id)

    const datos = await leerDatosDeGrabacion(coni, { fila, estado: "guion_por_aprobar", guion: GUION, zona: ZONA })

    expect(datos.vozSinCobro).toBe(esperado)
  })

  it("reads the latest voice attempt, not an older refused one", async () => {
    const id = await piezaPorFirmar()
    await gastoDeVoz(id, `${id}:voz:${"ab".repeat(8)}:0`, "sin_cobro")
    await gastoDeVoz(id, `${id}:voz:${"ab".repeat(8)}:1`, "abierto")
    const fila = await leerFila(id)

    const datos = await leerDatosDeGrabacion(coni, { fila, estado: "guion_por_aprobar", guion: GUION, zona: ZONA })

    expect(datos.vozSinCobro).toBe(false)
  })
})

describe("vozVigente", () => {
  async function configuracion() {
    return leerConfigProduccion(await leerProduccion(clienteDeServicio()))
  }

  it("accepts a take of the script, the legacy key of the current approval and nothing else", async () => {
    const id = await piezaAprobada()
    const config = await configuracion()
    const base = await leerFila(id)
    const toma = claveDeToma(id, HUELLA, 3)
    const legada = claveVozAprobada(id, base.puerta1_hash)

    expect(vozVigente({ ...base, audio_id: toma }, GUION, config)).toBe(toma)
    expect(vozVigente({ ...base, audio_id: legada }, GUION, config)).toBe(legada)
    expect(vozVigente({ ...base, audio_id: claveVozAprobada(id, "d".repeat(64)) }, GUION, config)).toBeNull()
    expect(vozVigente({ ...base, audio_id: null }, GUION, config)).toBeNull()
  })

  it("keeps the own voice of a piece approved under formula 1", async () => {
    const id = await piezaAprobada()
    const config = await configuracion()
    const base = await leerFila(id)

    expect(vozVigente({ ...base, puerta1_formula: null, audio_id: "voces/antigua.mp3" }, GUION, config)).toBe(
      "voces/antigua.mp3",
    )
  })
})
