import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, comoConi, comoServicio, fallaCon, pool } from "./db"
import { crearCarruselEn } from "./flujo"

afterAll(() => pool.end())

/** Every case runs in its own transaction and is rolled back: nothing stays in the database. */
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

async function versionVigente(c: pg.PoolClient, id: string) {
  const { rows } = await c.query("select * from public.carruseles where pieza_id = $1 order by version desc limit 1", [
    id,
  ])
  return rows[0]
}

/** What `guardar_armado` will do in Task 5, written here by hand as the service. */
async function armadoAMano(c: pg.PoolClient, id: string) {
  await asumir(c, comoServicio)
  const v = await versionVigente(c, id)
  const claves = v.laminas.map((_: unknown, i: number) => `carruseles/${id}/${v.id}/lamina-0${i + 1}.png`)
  await c.query("update public.carruseles set estado = 'listo', pdf_clave = $2, png_claves = $3 where id = $1", [
    v.id,
    `carruseles/${id}/${v.id}/carrusel.pdf`,
    claves,
  ])
  await c.query("update public.piezas set estado = 'carrusel_por_aprobar', version = version + 1 where id = $1", [id])
  return v
}

describe("20261027000100: rendering, retry and gate 2 of a carousel", () => {
  it("lets a failed render wait in error_produccion and Coni retry it into armando_carrusel", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      await c.query(
        `update public.piezas set estado = 'error_produccion', estado_antes_del_error = 'armando_carrusel',
         explicacion = 'No pude armar el carrusel.', version = version + 1 where id = $1`,
        [id],
      )
      await asumir(c, comoConi)
      await c.query(
        `update public.piezas set estado = 'armando_carrusel', estado_antes_del_error = null, explicacion = null,
         intento = intento + 1, version = version + 1 where id = $1`,
        [id],
      )
      const { rows } = await c.query("select estado from public.piezas where id = $1", [id])
      expect(rows[0].estado).toBe("armando_carrusel")
    })
  })

  it("refuses a session moving gate 2 back to armando_carrusel: design changes go through the function", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await armadoAMano(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'armando_carrusel', version = version + 1 where id = $1",
        [id],
      )
      expect(error.message).toBe("diseno_por_funcion")
    })
  })

  it("refuses a session moving gate 2 back to be rewritten: text changes go through the function", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await armadoAMano(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'guion_en_proceso', version = version + 1 where id = $1",
        [id],
      )
      expect(error.message).toBe("cambio_por_funcion")
    })
  })

  it("signs gate 2 only on the latest rendered version, with gate 1's words", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      const v = await armadoAMano(c, id)
      await asumir(c, comoConi)
      const firmar = (carruselId: string, hash: string) =>
        fallaCon(
          c,
          `update public.piezas set estado = 'programado', puerta2_carrusel_id = $2, puerta2_hash_texto = $3,
           puerta2_publicar_en = now() + interval '1 day', puerta2_en = now(), version = version + 1 where id = $1`,
          [id, carruselId, hash],
        )
      expect((await firmar(v.id, "f".repeat(64))).message).toBe("carrusel_no_coincide")

      await c.query(
        `update public.piezas set estado = 'programado', puerta2_carrusel_id = $2, puerta2_hash_texto = $3,
         puerta2_publicar_en = now() + interval '1 day', puerta2_en = now(), version = version + 1 where id = $1`,
        [id, v.id, v.hash_texto],
      )
      const { rows } = await c.query(
        "select estado, puerta2_carrusel_id, puerta2_video_id, puerta2_formula from public.piezas where id = $1",
        [id],
      )
      expect(rows[0]).toEqual({
        estado: "programado",
        puerta2_carrusel_id: v.id,
        puerta2_video_id: null,
        puerta2_formula: null,
      })
      const publicaciones = await c.query("select destino, estado from public.publicaciones where pieza_id = $1", [id])
      expect(publicaciones.rows).toEqual([{ destino: "linkedin", estado: "esperando" }])
    })
  })

  it("refuses a version marked listo without its files", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      const v = await versionVigente(c, id)
      const error = await fallaCon(c, "update public.carruseles set estado = 'listo' where id = $1", [v.id])
      expect(error.message).toContain("listo_con_archivos")
    })
  })

  it("tells Coni when the slides are ready and when a carousel needs her signature again", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel", { titulo: "Lo que un chatbot no ve de ti" })
      await armadoAMano(c, id)
      const listo = await c.query("select tipo, mensaje from public.avisos where pieza_id = $1", [id])
      expect(listo.rows).toContainEqual({
        tipo: "video_listo",
        mensaje: "Tu carrusel «Lo que un chatbot no ve de ti» está listo para verlo y elegir la fecha.",
      })

      const otro = await crearCarruselEn(c, "armando_carrusel", { titulo: "Otro carrusel" })
      await asumir(c, comoServicio)
      await c.query(
        `update public.piezas set estado = 'guion_por_aprobar', puerta1_hash = null, puerta1_en = null,
         version = version + 1 where id = $1`,
        [otro],
      )
      const vuelta = await c.query("select mensaje from public.avisos where pieza_id = $1", [otro])
      expect(vuelta.rows.map((r) => r.mensaje)).toContain("Tu carrusel «Otro carrusel» necesita tu firma de nuevo.")
    })
  })

  it("names armando_carrusel among the steps an error can come from", async () => {
    const { rows } = await pool.query(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'piezas_estado_antes_del_error_check'",
    )
    expect(rows[0].def).toContain("armando_carrusel")
  })
})
