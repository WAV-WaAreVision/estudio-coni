import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Database } from "@/lib/supabase/database.types"
import { leerVersionesDeTransparencia } from "@/lib/transparencia/versiones"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

let coni: SupabaseClient<Database>
const LARGO = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const OTRO = `${LARGO} Y una línea más.`

const quitarPublicadas = () => pool.query("delete from public.transparencia_versiones where not propuesta")

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(quitarPublicadas)
afterEach(quitarPublicadas)
afterAll(() => pool.end())

async function publicar(texto: string, motivo: string): Promise<void> {
  const { error } = await coni.rpc("publicar_transparencia", { p_texto: texto, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

describe("leerVersionesDeTransparencia", () => {
  it("has only WAV's draft before the first publication", async () => {
    const versiones = await leerVersionesDeTransparencia(coni)

    expect(versiones.vigente).toBeNull()
    expect(versiones.propuesta).toMatchObject({ version: 0, propuesta: true, vigente: false })
    expect(versiones.propuesta?.texto).toMatch(/^Uso inteligencia artificial para hacer mi contenido/)
    expect(versiones.historial).toEqual([])
  })

  it("lists Coni's versions newest first and knows the current one", async () => {
    await publicar(LARGO, "Primera versión")
    await publicar(OTRO, "Agrego una línea")

    const versiones = await leerVersionesDeTransparencia(coni)

    expect(versiones.historial.map((version) => [version.version, version.vigente])).toEqual([
      [2, true],
      [1, false],
    ])
    expect(versiones.vigente).toMatchObject({
      version: 2,
      texto: OTRO,
      motivo: "Agrego una línea",
      creadaEn: expect.any(String),
    })
  })
})
