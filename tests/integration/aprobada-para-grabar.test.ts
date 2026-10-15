// tests/integration/aprobada-para-grabar.test.ts
import { afterAll, describe, expect, it } from "vitest"
import { como, comoPostgres, fallaCon, pool } from "./db"
import { crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

// 20261004000110 recreated the constraint without these two states (20261001001610 had them): a piece handed over
// for a manual upload, or closed by hand, could lose its gate 1 approval without the database noticing.
describe("aprobada_para_grabar en las piezas que se suben a mano", () => {
  for (const estado of ["para_subir_a_mano", "publicado_a_mano"] as const) {
    it(`refuses ${estado} without a gate 1 approval`, async () => {
      await como(comoPostgres, async (c) => {
        const id = await crearPiezaEn(c, estado)
        expect((await leer(c, id)).estado).toBe(estado)
        const err = await fallaCon(
          c,
          // The whole approval goes (puerta1_completa); proteger_pieza clears puerta1_por with the hash.
          "update public.piezas set puerta1_hash = null, puerta1_en = null, version = version + 1 where id = $1",
          [id],
        )
        expect(err.code).toBe("23514")
        expect(err.constraint).toBe("aprobada_para_grabar")
      })
    })
  }
})
