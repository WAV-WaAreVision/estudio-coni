import { afterAll, afterEach, describe, expect, it } from "vitest"
import { anotadorDeBorrados } from "@/lib/datos-personales/borrados"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"

const AHORA = "2026-11-02T06:00:00.000Z"

afterEach(async () => {
  await pool.query("delete from public.registro_de_borrados where borrado_en = $1", [AHORA])
})
afterAll(() => pool.end())

async function anotados() {
  const { rows } = await pool.query<{ regla: string; cantidad: number }>(
    "select regla, cantidad from public.registro_de_borrados where borrado_en = $1",
    [AHORA],
  )
  return rows
}

describe("anotadorDeBorrados", () => {
  it("writes one row with the rule, how many and when", async () => {
    await anotadorDeBorrados(clienteDeServicio(), () => AHORA)("respaldos", 3)
    expect(await anotados()).toEqual([{ regla: "respaldos", cantidad: 3 }])
  })

  it("writes nothing when nothing was deleted", async () => {
    await anotadorDeBorrados(clienteDeServicio(), () => AHORA)("respaldos", 0)
    expect(await anotados()).toEqual([])
  })

  it("says which rule it could not write down", async () => {
    // Coni's session may read the log but never write it.
    const anotar = anotadorDeBorrados(await clienteDeConi(), () => AHORA)
    await expect(anotar("huella_de_visitas", 2)).rejects.toMatchObject({
      message: expect.stringMatching(/No pude anotar el borrado de huella_de_visitas/),
      cause: { code: "42501" },
    })
  })

  it("lets a negative count reach the database check instead of skipping it", async () => {
    const anotar = anotadorDeBorrados(clienteDeServicio(), () => AHORA)
    await expect(anotar("respaldos", -1)).rejects.toThrow(/No pude anotar el borrado de respaldos/)
    expect(await anotados()).toEqual([])
  })
})
