import { afterAll, describe, expect, it } from "vitest"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

describe("a stale-version conflict through PostgREST", () => {
  it("answers PT409 within 5 seconds instead of hanging when the version is stale", async () => {
    const inicio = Date.now()
    const { error } = await clienteDeServicio().rpc("guardar_borrador", {
      p_pieza: "00000000-0000-0000-0000-000000000000",
      p_version: 1,
      p_guion: "guion",
      p_texto: "texto",
      p_revision: [],
      p_clave: "sin-reserva",
      p_real: 0,
    })

    expect(error).toMatchObject({ code: "PT409", message: "version_desfasada" })
    expect(Date.now() - inicio).toBeLessThan(5000)
  }, 15000)
})
