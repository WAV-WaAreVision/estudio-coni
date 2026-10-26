import { afterAll, describe, expect, it } from "vitest"
import { ESTADOS } from "@/lib/dominio/estados"
import { pool } from "./db"

afterAll(() => pool.end())

describe("estado_pieza", () => {
  it("mirrors ESTADOS, the two carousel states included", async () => {
    const { rows } = await pool.query<{ valor: string }>(
      "select unnest(enum_range(null::public.estado_pieza))::text as valor",
    )
    expect(new Set(rows.map((fila) => fila.valor))).toEqual(new Set(ESTADOS))
    expect(ESTADOS).toContain("armando_carrusel")
    expect(ESTADOS).toContain("carrusel_por_aprobar")
  })
})
