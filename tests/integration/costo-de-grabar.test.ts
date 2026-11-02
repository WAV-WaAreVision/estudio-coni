import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerCostoDeGrabar, leerPresupuesto } from "@/lib/datos/pantallas"
import { textoParaVoz } from "@/lib/dominio/etiquetas"
import { dolares } from "@/lib/formato"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { estimarCostoVideo } from "@/lib/produccion/grabar"
import coniConfig from "../fixtures/coni.config.json"
import { pool, sinLimiteFijado } from "./db"
import { clienteDeConi } from "./sesion-coni"

const GUION = "Hay una conversación que casi nadie tiene a tiempo y que cambia cómo se vive el deseo. ".repeat(6)
let AHORA = 0
let coni: Awaited<ReturnType<typeof clienteDeConi>>

beforeAll(async () => {
  coni = await clienteDeConi()
  AHORA = Date.now()
})
beforeEach(async () => {
  await pool.query("update public.ajustes set produccion = $1::jsonb, tope_mensual_usd = 40, limite_duro_usd = null", [
    JSON.stringify(coniConfig),
  ])
})
afterEach(async () => {
  await pool.query("update public.ajustes set produccion = '{}'::jsonb, tope_mensual_usd = 40, limite_duro_usd = null")
})
afterAll(() => pool.end())

async function limiteQueCubreSoloElVideo(): Promise<{ video: number; voz: number }> {
  const video = estimarCostoVideo(GUION, coniConfig.heygen.motor)
  const voz = estimarCostoVoz(GUION)
  const { usado } = await leerPresupuesto(coni, AHORA)
  const limite = usado + video + voz / 2
  await pool.query("update public.ajustes set tope_mensual_usd = $1, limite_duro_usd = $1", [limite])
  return { video, voz }
}

beforeEach(sinLimiteFijado)
afterEach(sinLimiteFijado)

describe("leerCostoDeGrabar", () => {
  it("adds the voice to the video estimate when the piece has no audio yet", async () => {
    const { video, voz } = await limiteQueCubreSoloElVideo()
    const costo = await leerCostoDeGrabar(coni, GUION, AHORA, null)
    expect(costo.estimadoUsd).toBeCloseTo(video + voz, 6)
    expect(costo.linea).toContain(`Grabar cuesta unos ${dolares(video + voz)}`)
  })

  it("does not add the voice when the piece already has its audio", async () => {
    const { video } = await limiteQueCubreSoloElVideo()
    const costo = await leerCostoDeGrabar(coni, GUION, AHORA, "audio-ya-pagado")
    expect(costo.estimadoUsd).toBeCloseTo(video, 6)
  })

  it("prices the voice on the text ElevenLabs receives, without the tone marks of a model that would read them", async () => {
    const guion = `[warm] ${GUION} [pause] ${GUION}`
    const enviado = textoParaVoz(guion, coniConfig.elevenlabs.model_id)
    expect(enviado.length).toBeLessThan(guion.length)
    const costo = await leerCostoDeGrabar(coni, guion, AHORA, null)
    expect(costo.estimadoUsd).toBeCloseTo(
      estimarCostoVideo(guion, coniConfig.heygen.motor) + estimarCostoVoz(enviado),
      6,
    )
  })
})

describe("leerPresupuesto", () => {
  it("does not count a released voice reservation, refused or swept", async () => {
    const antes = (await leerPresupuesto(coni, AHORA)).usado
    const claves = [`presupuesto-${crypto.randomUUID()}`, `presupuesto-${crypto.randomUUID()}`]
    await pool.query("select public.reservar_gasto(null, 'elevenlabs', 'voz', 0.5, $1, now())", [claves[0]])
    await pool.query("select public.reservar_gasto(null, 'elevenlabs', 'voz', 0.5, $1, now())", [claves[1]])
    expect((await leerPresupuesto(coni, AHORA)).usado).toBeCloseTo(antes + 1, 4)

    await pool.query("select public.liberar_gasto($1, true)", [claves[0]])
    await pool.query("select public.liberar_gasto($1)", [claves[1]])

    expect((await leerPresupuesto(coni, AHORA)).usado).toBeCloseTo(antes, 4)
    await pool.query("delete from public.gastos where clave = any($1)", [claves])
  })

  it("counts the Santiago month of the spend when UTC is already in the next one", async () => {
    // 01:00 UTC on 1 March is still 28 February in Santiago: reservar_gasto files the spend in February.
    const instante = "2027-03-01T01:00:00Z"
    const clave = `presupuesto-${crypto.randomUUID()}`
    const antes = (await leerPresupuesto(coni, Date.parse(instante))).usado
    try {
      await pool.query("select public.reservar_gasto(null, 'elevenlabs', 'voz', 0.5, $1, $2)", [clave, instante])
      expect((await leerPresupuesto(coni, Date.parse(instante))).usado).toBeCloseTo(antes + 0.5, 4)
    } finally {
      await pool.query("delete from public.gastos where clave = $1", [clave])
    }
  })
})
