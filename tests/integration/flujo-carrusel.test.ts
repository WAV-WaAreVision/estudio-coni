import { afterAll, describe, expect, it } from "vitest"
import { pool } from "./db"
import { borrarSembrado, leerFila, sembrarCarrusel } from "./siembra"

const creadas: string[] = []
afterAll(async () => {
  await borrarSembrado(creadas, [])
  await pool.end()
})

describe("sembrarCarrusel past gate 1", () => {
  it.each(["carrusel_por_aprobar", "programado", "para_subir_a_mano", "error_produccion"] as const)(
    "walks a carousel to %s through the real flow",
    async (destino) => {
      const id = await sembrarCarrusel(destino)
      creadas.push(id)
      expect((await leerFila(id)).estado).toBe(destino)
      const { rows } = await pool.query("select estado from public.carruseles where pieza_id = $1 order by version", [
        id,
      ])
      expect(rows.at(-1)?.estado).toBe(destino === "error_produccion" ? "fallo" : "listo")
    },
  )
})
