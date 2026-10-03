import { afterAll, afterEach, describe, expect, it } from "vitest"
import { buscarFfmpegBasico } from "@/lib/ingesta/fotogramas"
import { procesarMaterial } from "@/lib/ingesta/procesar"
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
} from "./procesar-comun"

afterEach(limpiar)
afterAll(() => pool.end())

const FFMPEG = await buscarFfmpegBasico()
// Spanish of Spain, so every part needs the adaptation: 100k characters cost more than the threshold.
const TEXTO_LARGO = "Vosotros tenéis que coger el ordenador y el móvil para hablar de lo que necesitáis. ".repeat(1_250)

async function estado(id: string) {
  const { rows } = await pool.query<{
    motivo_fallo: string | null
    costo_estimado_usd: string | null
    costo_confirmado_en: Date | null
    corrida_id: string | null
  }>("select motivo_fallo, costo_estimado_usd, costo_confirmado_en, corrida_id from public.materiales where id = $1", [
    id,
  ])
  const fila = rows[0]
  if (!fila) throw new Error("sin fila")
  return fila
}

describe("confirmación de costo", () => {
  it("stops a long material with its estimate, a reason and the claim released, calling no provider", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_LARGO })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "esperando_confirmacion" })
    const fila = await estado(id)
    const costo = Number(fila.costo_estimado_usd)
    expect(costo).toBeGreaterThan(0.5)
    expect(fila.motivo_fallo).toBe(
      `Este material es largo: procesarlo cuesta cerca de US$ ${costo.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Confírmalo para seguir.`,
    )
    expect(fila.corrida_id).toBeNull()
    expect((await material(id)).estado).toBe("procesando")
    expect(claude.total).toBe(0)
    expect(await gastos(id)).toEqual([])
  })

  it("continues once the cost was confirmed", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_LARGO })
    await procesarMaterial(await deps(almacen), id)
    await pool.query("update public.materiales set costo_confirmado_en = now(), motivo_fallo = null where id = $1", [
      id,
    ])

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(claude.adaptaciones.length).toBeGreaterThan(0)
    expect(claude.fichas).toHaveLength(1)
    expect((await material(id)).estado).toBe("listo")
  })

  it("does not ask for anything when the material is small", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect((await estado(id)).costo_estimado_usd).toBeNull()
  })

  it.skipIf(!FFMPEG)("does not pay the transcription again after the confirmation", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const palabras: [string, number][] = Array.from({ length: 12_000 }, (_, i) => [
      i % 7 === 0 ? "vosotros" : "ordenador",
      i * 0.1,
    ])
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

    const primera = await procesarMaterial(await deps(almacen), id)
    expect(primera).toEqual({ resultado: "esperando_confirmacion" })
    expect(scribe.n).toBe(1)
    expect((await gastos(id)).filter((g) => g.paso === "transcripcion")).toHaveLength(1)

    await pool.query("update public.materiales set costo_confirmado_en = now(), motivo_fallo = null where id = $1", [
      id,
    ])
    const segunda = await procesarMaterial(await deps(almacen), id)

    expect(segunda).toEqual({ resultado: "listo" })
    expect(scribe.n).toBe(1)
    expect((await gastos(id)).filter((g) => g.paso === "transcripcion")).toHaveLength(1)
  })
})
