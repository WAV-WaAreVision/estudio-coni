// @vitest-environment node
// Reads fixture files through import.meta.url, which jsdom does not support.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { alinearConGuion, assDe, leerSrt } from "@/lib/dominio/subtitulos"

const REELS = ["2026-09-25-taller-propia-diosa", "2026-09-30-deseo-se-esconde"]

function leer(reel: string, archivo: string): string {
  return readFileSync(new URL(`../fixtures/goldens/${reel}/${archivo}`, import.meta.url), "utf-8")
}

function sinFuente(ass: string): string {
  return ass
    .split("\n")
    .filter((linea) => !linea.startsWith("Style: "))
    .join("\n")
}

describe.each(REELS)("golden %s", (reel) => {
  it("genera el mismo ass que coni.py cuando se cambia solo la fuente", () => {
    const cues = alinearConGuion(leerSrt(leer(reel, "subtitulos.srt")), leer(reel, "guion.txt").trim())
    const ass = assDe(cues)
    expect(sinFuente(ass)).toBe(sinFuente(leer(reel, "subtitulos.ass")))
    expect(ass).toContain("Style: Coni,Montserrat,84,")
  })
})
