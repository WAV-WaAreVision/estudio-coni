import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { leerTransparenciaVigente } from "@/lib/transparencia/publica"
import { pool } from "./db"
import { clienteAnonimoDePrueba } from "./sesion-coni"

const LARGO = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const quitarPublicadas = () => pool.query("delete from public.transparencia_versiones where not propuesta")

beforeEach(quitarPublicadas)
afterEach(quitarPublicadas)
afterAll(() => pool.end())

describe("leerTransparenciaVigente", () => {
  it("gives a visitor nothing before the first publication, never WAV's draft", async () => {
    expect(await leerTransparenciaVigente(clienteAnonimoDePrueba())).toBeNull()
  })

  it("gives a visitor the current text and when it was published", async () => {
    await pool.query(
      "insert into public.transparencia_versiones (version, texto, motivo, vigente, creada_en) values (1, $1, 'Prueba', true, '2026-11-02T15:00:00Z')",
      [LARGO],
    )

    expect(await leerTransparenciaVigente(clienteAnonimoDePrueba())).toEqual({
      texto: LARGO,
      creadaEn: expect.stringMatching(/^2026-11-02T15:00:00/),
    })
  })
})
