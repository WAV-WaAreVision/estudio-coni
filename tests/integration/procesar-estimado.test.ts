import { afterAll, afterEach, describe, expect, it } from "vitest"
import { buscarFfmpegBasico } from "@/lib/ingesta/fotogramas"
import { estimarCostoRestante, procesarMaterial } from "@/lib/ingesta/procesar"
import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { pool } from "./db"
import {
  almacenEnMemoria,
  conFfmpeg,
  crearMaterial,
  deps,
  gastos,
  limpiar,
  material,
  simularClaude,
  simularScribe,
  TEXTO_CHILENO,
  texto,
} from "./procesar-comun"

afterEach(limpiar)
afterAll(() => pool.end())

const FFMPEG = await buscarFfmpegBasico()
// About 41 chunks: one claim request each, more than the one dollar the old gate stopped at.
const PARRAFO = "Hablar de lo que cada persona necesita ayuda a la pareja. ".repeat(88)
const TEXTO_LARGO = `${PARRAFO}\n\n`.repeat(98)

async function estado(id: string) {
  const { rows } = await pool.query<{
    estado: string
    motivo_fallo: string | null
    costo_estimado_usd: string | null
    corrida_id: string | null
  }>("select estado, motivo_fallo, costo_estimado_usd, corrida_id from public.materiales where id = $1", [id])
  const fila = rows[0]
  if (!fila) throw new Error("sin fila")
  return fila
}

/** What the steps after the extraction cost, from the extraction the task stored. */
function estimadoDe(almacen: ReturnType<typeof almacenEnMemoria>, id: string, rol = "referente"): number {
  const partes = JSON.parse(texto(almacen, id, "partes-original.json") ?? "null").partes
  return estimarCostoRestante(partes, rol)
}

describe("el costo estimado, sin compuerta", () => {
  it("runs a long material to listo without a stop, with its estimate written and no reason", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_LARGO })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    const fila = await estado(id)
    expect(fila).toMatchObject({ estado: "listo", motivo_fallo: null, corrida_id: null })
    const costo = Number(fila.costo_estimado_usd)
    expect(costo).toBeGreaterThan(1)
    expect(costo).toBeCloseTo(estimadoDe(almacen, id), 6)
    expect(claude.afirmaciones.length).toBeGreaterThan(0)
    expect((await gastos(id)).length).toBeGreaterThan(0)
  })

  it("writes the estimate of a small material too", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    const costo = Number((await estado(id)).costo_estimado_usd)
    expect(costo).toBeGreaterThan(0)
    expect(costo).toBeLessThan(1)
    expect(costo).toBeCloseTo(estimadoDe(almacen, id), 6)
  })

  it("writes the card's estimate for a strategy material", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO, rol: "estrategia" })

    expect(await procesarMaterial(await deps(almacen), id)).toEqual({ resultado: "listo" })
    expect(Number((await estado(id)).costo_estimado_usd)).toBeCloseTo(estimadoDe(almacen, id, "estrategia"), 6)
  })

  it("still stops a long material at the hard limit, with its reason and its estimate, calling no provider", async () => {
    await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_LARGO })
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.0001")
    try {
      const resultado = await procesarMaterial(await deps(almacen), id)

      expect(resultado).toEqual({ resultado: "limite" })
      const fila = await estado(id)
      expect(fila).toMatchObject({ estado: "procesando", motivo_fallo: TEXTO_LIMITE, corrida_id: null })
      expect(Number(fila.costo_estimado_usd)).toBeGreaterThan(1)
      expect(claude.total).toBe(0)
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
  })

  it.skipIf(!FFMPEG)("pays the transcription once and goes on to the claims in the same run", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const palabras: [string, number][] = Array.from({ length: 50_000 }, (_, i) => ["ordenador", i * 0.1])
    const scribe = simularScribe("spa", palabras)
    const audio = await conFfmpeg(
      FFMPEG ?? "ffmpeg",
      ["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "libmp3lame"],
      "salida.mp3",
    )
    const id = await crearMaterial(almacen, {
      tipo: "audio",
      archivo: { extension: "mp3", tipo: "audio/mpeg", datos: audio },
    })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(scribe.n).toBe(1)
    expect((await gastos(id)).filter((g) => g.paso === "transcripcion")).toHaveLength(1)
    expect(claude.afirmaciones.length).toBeGreaterThan(0)
    expect(Number((await estado(id)).costo_estimado_usd)).toBeGreaterThan(1)
    expect((await material(id)).estado).toBe("listo")
  })
})
