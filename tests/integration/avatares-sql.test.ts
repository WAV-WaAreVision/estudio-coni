import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { sqlParaAgregar, sqlParaQuitar } from "@/lib/avatares/agregar"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import coniConfig from "../fixtures/coni.config.json"
import { pool } from "./db"

const A = { avatar_id: "look_a", nombre: "Coni d'Estudio", imagen: "avatares/look_a.jpg" }
const B = { avatar_id: "look_b", nombre: "Terraza", imagen: "avatares/look_b.png" }

async function avatares() {
  const { rows } = await pool.query("select produccion from public.ajustes")
  return leerConfigProduccion(rows[0].produccion).heygen.avatares
}

beforeEach(() => pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(coniConfig)]))
afterEach(() => pool.query("update public.ajustes set produccion = '{}'::jsonb"))

describe("the SQL printed by agregar-avatar", () => {
  it("adds looks to a config that has none, keeping the rest of the config valid", async () => {
    await pool.query(sqlParaAgregar(A))
    await pool.query(sqlParaAgregar(B))

    expect(await avatares()).toEqual([A, B])
    const { rows } = await pool.query("select produccion #>> '{heygen,avatar_id}' as legado from public.ajustes")
    expect(rows[0].legado).toBe(coniConfig.heygen.avatar_id)
  })

  it("is idempotent: running it again replaces the entry instead of repeating it", async () => {
    await pool.query(sqlParaAgregar(A))
    await pool.query(sqlParaAgregar({ ...A, nombre: "Estudio nuevo" }))

    expect(await avatares()).toEqual([{ ...A, nombre: "Estudio nuevo" }])
  })

  it("removes one look and leaves the others", async () => {
    await pool.query(sqlParaAgregar(A))
    await pool.query(sqlParaAgregar(B))
    await pool.query(sqlParaQuitar("look_a"))

    expect(await avatares()).toEqual([B])
  })

  it("updates the single settings row", async () => {
    const resultado = await pool.query(sqlParaAgregar(A))
    expect(resultado.rowCount).toBe(1)
  })
})
