// @vitest-environment node
// Reads fixture files through import.meta.url, which jsdom does not support.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { alinearConGuion, assDe, leerSrt } from "@/lib/dominio/subtitulos"

const REELS = ["2026-09-25-taller-propia-diosa", "2026-09-30-deseo-se-esconde"]

function leer(reel: string, archivo: string): string {
  return readFileSync(new URL(`../fixtures/goldens/${reel}/${archivo}`, import.meta.url), "utf-8")
}

// Only the font differs from coni.py (AvenirNext-Bold vs Montserrat); every other Style field is compared.
const FUENTE = /^(Style: Coni,)[^,]+(,)/m
function conFuenteNeutra(ass: string): string {
  return ass.replace(FUENTE, "$1<fuente>$2")
}

// The goldens hold no braces, backslashes or odd timestamps; escaping and strict parsing are covered in subtitulos.test.ts.
describe.each(REELS)("golden %s", (reel) => {
  it("genera el mismo ass que coni.py cuando se cambia solo la fuente", () => {
    const cues = alinearConGuion(leerSrt(leer(reel, "subtitulos.srt")), leer(reel, "guion.txt").trim())
    const ass = assDe(cues)
    expect(conFuenteNeutra(ass)).toBe(conFuenteNeutra(leer(reel, "subtitulos.ass")))
    expect(ass).toContain("Style: Coni,Montserrat,84,")
  })
})
