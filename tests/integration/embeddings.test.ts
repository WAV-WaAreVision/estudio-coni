import { afterAll, afterEach, describe, expect, it } from "vitest"
import { CONI, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { almacenEnMemoria, crearMaterial, limpiar, TEXTO_CHILENO } from "./procesar-comun"

afterEach(limpiar)
afterAll(() => pool.end())

const vector = (valor: number) => Array.from({ length: 1024 }, () => valor)

async function conEmbedding(id: string) {
  await pool.query(
    "insert into public.embeddings_ficha (material_id, vector, modelo) values ($1, $2::extensions.vector, 'voyage-3.5')",
    [id, JSON.stringify(vector(0.5))],
  )
}

async function nuevo() {
  const almacen = almacenEnMemoria()
  const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
  return { almacen, id }
}

describe("esquema de embeddings", () => {
  it("lets Coni and the maintainer read but not write, and the service write", async () => {
    const { id } = await nuevo()
    await conEmbedding(id)

    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        const { rows } = await c.query("select material_id from public.embeddings_ficha where material_id = $1", [id])
        expect(rows).toHaveLength(1)
        const e = await fallaCon(c, "delete from public.embeddings_ficha where material_id = $1", [id])
        expect(e.code).toBe("42501")
      })
    }
    await como(comoServicio, async (c) => {
      const r = await c.query("update public.embeddings_ficha set modelo = 'x' where material_id = $1", [id])
      expect(r.rowCount).toBe(1)
    })
  })

  it("has an HNSW cosine index on the vector", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'embeddings_ficha'",
    )
    expect(rows.some((r) => /hnsw/i.test(r.indexdef) && /vector_cosine_ops/.test(r.indexdef))).toBe(true)
  })

  it("deletes the embedding with its material", async () => {
    const { id } = await nuevo()
    await conEmbedding(id)
    await como(comoPostgres, async (c) => {
      await c.query("delete from public.materiales where id = $1", [id])
      const { rows } = await c.query("select 1 from public.embeddings_ficha where material_id = $1", [id])
      expect(rows).toHaveLength(0)
    })
    expect(CONI).toBeDefined()
  })
})
