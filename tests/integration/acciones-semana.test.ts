import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { claveMotor } from "@/lib/acciones/disparos"
import { proponerAhora } from "@/lib/acciones/semana"
import { NO_ARRANCO, YA_PROPUSO } from "@/lib/dominio/biblioteca/semana"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { vaciarMotor } from "./siembra"

type Db = SupabaseClient<Database>

/** Wednesday 4 November at noon in Santiago: its week closes on Sunday the 8th. */
const AHORA = new Date("2026-11-04T15:00:00Z")
const SEMANA = "2026-11-08"
const SOLO_CONI = "Esta app es solo para Coni."

let coni: Db
let wav: Db

const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000).toISOString()

async function corrida(semana: string, estado: "corriendo" | "lista" | "fallida", creadaEn: string): Promise<void> {
  await pool.query("insert into public.motor_corridas (semana, estado, creada_en) values ($1, $2, $3)", [
    semana,
    estado,
    creadaEn,
  ])
}

function deps(db: Db, motor = vi.fn(async (_semana: string, _intento?: string): Promise<void> => {})) {
  return { db, disparar: { motor }, ahora: () => AHORA, motor }
}

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
})

beforeEach(() => vaciarMotor())

afterAll(async () => {
  await vaciarMotor()
  await pool.end()
})

describe("proponerAhora", () => {
  it("refuses anyone who is not Coni and starts nothing", async () => {
    const d = deps(wav)
    expect(await proponerAhora(d)).toEqual({ ok: false, error: SOLO_CONI })
    expect(d.motor).not.toHaveBeenCalled()
  })

  it("asks the engine once for this week, keyed by its Sunday, when the week has no run yet", async () => {
    await corrida("2026-11-01", "lista", hace(60 * 24 * 3))
    const d = deps(coni)
    expect(await proponerAhora(d)).toEqual({ ok: true })
    expect(d.motor).toHaveBeenCalledTimes(1)
    expect(d.motor).toHaveBeenCalledWith(SEMANA, undefined)
    expect(claveMotor(...(d.motor.mock.calls[0] ?? [""]))).toBe(`motor:${SEMANA}`)
  })

  it.each([
    ["a ready week", "lista" as const, 600],
    ["a run alive for 10 minutes", "corriendo" as const, 10],
  ])("answers that the engine already proposed on %s, and starts nothing", async (_caso, estado, minutos) => {
    await corrida(SEMANA, estado, hace(minutos))
    const d = deps(coni)
    expect(await proponerAhora(d)).toEqual({ ok: false, error: YA_PROPUSO })
    expect(d.motor).not.toHaveBeenCalled()
  })

  it.each([
    ["a failed week", "fallida" as const, 5],
    ["a run stuck for 31 minutes", "corriendo" as const, 31],
  ])("asks again on %s", async (_caso, estado, minutos) => {
    await corrida(SEMANA, estado, hace(minutos))
    const d = deps(coni)
    expect(await proponerAhora(d)).toEqual({ ok: true })
    expect(d.motor).toHaveBeenCalledWith(SEMANA, expect.any(String))
  })

  it("retries a failed week with a key of its own, so Trigger never answers it with the run that failed", async () => {
    await corrida(SEMANA, "fallida", hace(5))
    const d = deps(coni)
    expect(await proponerAhora(d)).toEqual({ ok: true })
    const [semana, intento] = d.motor.mock.calls[0] ?? [""]
    expect(Date.parse(intento ?? "")).toBe(Date.parse(hace(5)))
    expect(claveMotor(semana, intento)).not.toBe(claveMotor(SEMANA))
  })

  it("says it could not ask when the run does not start, and logs why for WAV", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const d = deps(
      coni,
      vi.fn(async (_semana: string): Promise<void> => {
        throw new Error("Trigger caído")
      }),
    )
    expect(await proponerAhora(d)).toEqual({ ok: false, error: NO_ARRANCO })
    expect(registro).toHaveBeenCalledWith(`No pude iniciar el motor para la semana ${SEMANA}`, expect.any(Error))
    registro.mockRestore()
  })
})
