// @vitest-environment node
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buscarFfmpegBasico, deduplicarFotogramas, extraerFotogramas } from "@/lib/ingesta/fotogramas"

const FFMPEG = await buscarFfmpegBasico()
const VIDEO = join(__dirname, "../fixtures/ingesta/reel-subtitulado.mp4")

describe.skipIf(!FFMPEG)("frames of a subtitled reel (skipped only without any ffmpeg; no libass needed)", () => {
  const ffmpeg = FFMPEG ?? "ffmpeg"

  it("extracts one JPEG per second at 720 px wide", async () => {
    const fotogramas = await extraerFotogramas(new Uint8Array(await readFile(VIDEO)), { ffmpeg, cadaSegundos: 1 })

    expect(fotogramas.map((f) => f.segundo)).toEqual([0, 1, 2, 3, 4, 5])
    for (const f of fotogramas) {
      expect([f.jpeg[0], f.jpeg[1]]).toEqual([0xff, 0xd8])
    }
  })

  it("collapses the 6 frames of a 3-line reel to 3 or 4 and keeps the first", async () => {
    const todos = await extraerFotogramas(new Uint8Array(await readFile(VIDEO)), { ffmpeg, cadaSegundos: 1 })

    const unicos = await deduplicarFotogramas(todos, { ffmpeg })

    expect(unicos.length).toBeGreaterThanOrEqual(3)
    expect(unicos.length).toBeLessThanOrEqual(4)
    expect(unicos[0]?.segundo).toBe(0)
    expect(unicos.at(-1)?.segundo).toBe(5)
  })

  it("keeps the frame where the subtitle disappears", async () => {
    const todos = await extraerFotogramas(new Uint8Array(await readFile(VIDEO)), { ffmpeg, cadaSegundos: 1 })

    const segundos = (await deduplicarFotogramas(todos, { ffmpeg })).map((f) => f.segundo)

    expect(segundos).toContain(4)
  })
})
