import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, comoConi, comoServicio, fallaCon, pool } from "./db"
import { crearCarruselEn } from "./flujo"

afterAll(() => pool.end())

async function enTransaccion(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await fn(c)
  } finally {
    await c.query("rollback")
    c.release()
  }
}

async function versiones(c: pg.PoolClient, id: string) {
  const { rows } = await c.query(
    "select id, version, origen, estado, hash_texto from public.carruseles where pieza_id = $1 order by version",
    [id],
  )
  return rows
}

async function versionDe(c: pg.PoolClient, id: string): Promise<number> {
  const { rows } = await c.query("select version from public.piezas where id = $1", [id])
  return rows[0].version
}

/** Gate 2's "El diseño": the same slides in another variant, as Coni. */
async function cambiarVariante(c: pg.PoolClient, id: string) {
  await asumir(c, comoConi)
  const { rows } = await c.query(
    "select laminas from public.carruseles where pieza_id = $1 order by version desc limit 1",
    [id],
  )
  await c.query('select public.cambiar_diseno_de_carrusel($1, $2, $3::jsonb, \'{"variante": "oscura"}\'::jsonb)', [
    id,
    await versionDe(c, id),
    JSON.stringify(rows[0].laminas),
  ])
}

const NO_CABE = "Ese cambio no cabe en la lámina. Prueba otro."

describe("20261027000130: a design change that does not fit", () => {
  it("is never shortened: guardar_acortado refuses a design change's version", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "carrusel_por_aprobar")
      await cambiarVariante(c, id)
      const nueva = (await versiones(c, id)).at(-1)
      await asumir(c, comoServicio)
      const error = await fallaCon(
        c,
        "select public.guardar_acortado($1, $2, $3::jsonb, $4, '[]'::jsonb, 'Acorté.', 'clave-inexistente', 0.01)",
        [nueva.id, await versionDe(c, id), JSON.stringify([]), "0".repeat(64)],
      )
      expect(error.message).toBe("acortado_fuera_de_turno")
    })
  })

  it("is dropped and the piece goes back to gate 2 on the version she saw, with why", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "carrusel_por_aprobar")
      const [anterior] = await versiones(c, id)
      await cambiarVariante(c, id)
      const nueva = (await versiones(c, id)).at(-1)
      await asumir(c, comoServicio)
      await c.query("select public.rechazar_diseno_que_no_cabe($1, $2, $3)", [
        nueva.id,
        await versionDe(c, id),
        NO_CABE,
      ])
      expect(await versiones(c, id)).toEqual([anterior])
      const { rows } = await c.query("select estado, explicacion, cambios_de_texto from public.piezas where id = $1", [
        id,
      ])
      expect(rows[0]).toEqual({ estado: "carrusel_por_aprobar", explicacion: NO_CABE, cambios_de_texto: 0 })
    })
  })

  it("refuses dropping a version that is not a design change, and Coni's session", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      const [inicial] = await versiones(c, id)
      await asumir(c, comoServicio)
      const error = await fallaCon(c, "select public.rechazar_diseno_que_no_cabe($1, $2, $3)", [
        inicial.id,
        await versionDe(c, id),
        NO_CABE,
      ])
      expect(error.message).toBe("rechazo_fuera_de_turno")
      await asumir(c, comoConi)
      const sinPermiso = await fallaCon(c, "select public.rechazar_diseno_que_no_cabe($1, $2, $3)", [
        inicial.id,
        await versionDe(c, id),
        NO_CABE,
      ])
      expect(sinPermiso.code).toBe("42501")
    })
  })
})
