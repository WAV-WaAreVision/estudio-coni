import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoServicio, fallaCon, pool } from "./db"

afterAll(async () => {
  await pool.end()
})

const SUFIJO = randomUUID().slice(0, 8)

async function borradorDePilar(c: pg.PoolClient): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
     values ('linkedin', $1, $2, 'Una definición.', 10) returning id`,
    [`Pilar de prueba ${SUFIJO}`, `Prueba ${SUFIJO}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el borrador de pilar")
  return id
}

async function borradorDeRed(c: pg.PoolClient): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.borradores_de_red (nombre) values ($1) returning id",
    [`Red ${SUFIJO}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el borrador de red")
  return id
}

describe("borradores_de_pilar", () => {
  it("Coni saves a draft sealed with her and no decision, and edits it", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDePilar(c)
      const { rows } = await c.query(
        "select estado, creado_por, decidido_en, pilar_id from public.borradores_de_pilar where id = $1",
        [id],
      )
      expect(rows).toEqual([{ estado: "borrador", creado_por: CONI, decidido_en: null, pilar_id: null }])
      const editado = await c.query(
        "update public.borradores_de_pilar set nombre_corto = 'Otro corto', peso = 12.5 where id = $1",
        [id],
      )
      expect(editado.rowCount).toBe(1)
    })
  })

  it("WAV reads it and cannot write it, nobody deletes it, and anyone else sees nothing", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDePilar(c)
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.borradores_de_pilar where id = $1", [id])).rowCount).toBe(1)
      const deWav = await c.query("update public.borradores_de_pilar set nombre = 'De WAV' where id = $1", [id])
      expect(deWav.rowCount).toBe(0)
      const insertado = await fallaCon(
        c,
        `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
         values ('linkedin', 'De WAV', 'WAV', 'Definición.', 5)`,
      )
      expect(insertado.code).toBe("42501")
      for (const sesion of [comoConi, comoMantenedor, comoServicio]) {
        await asumir(c, sesion)
        const borrado = await fallaCon(c, "delete from public.borradores_de_pilar where id = $1", [id])
        expect(borrado.code).toBe("42501")
      }
      await asumir(c, comoOtra)
      expect((await c.query("select 1 from public.borradores_de_pilar where id = $1", [id])).rowCount).toBe(0)
    })
  })

  it("a draft is approved only by the RPC, and once discarded gets its date and cannot be edited or brought back", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDePilar(c)
      // Row level security or the `aprobado_con_pilar` check, whichever Postgres runs first.
      const aprobado = await fallaCon(c, "update public.borradores_de_pilar set estado = 'aprobado' where id = $1", [
        id,
      ])
      expect(["42501", "23514"]).toContain(aprobado.code)
      const conPilar = await fallaCon(
        c,
        "update public.borradores_de_pilar set pilar_id = (select id from public.categorias limit 1) where id = $1",
        [id],
      )
      expect(conPilar.code).toBe("42501")
      await c.query("update public.borradores_de_pilar set estado = 'descartado' where id = $1", [id])
      const { rows } = await c.query<{ decidido: boolean }>(
        "select decidido_en is not null as decidido from public.borradores_de_pilar where id = $1",
        [id],
      )
      expect(rows).toEqual([{ decidido: true }])
      expect(
        (await c.query("update public.borradores_de_pilar set estado = 'borrador' where id = $1", [id])).rowCount,
      ).toBe(0)
      expect(
        (await c.query("update public.borradores_de_pilar set nombre = 'Otra vez' where id = $1", [id])).rowCount,
      ).toBe(0)
    })
  })

  it("keeps the network one of the two, names trimmed, not empty and short enough, and the weight over 0 and up to 100", async () => {
    await como(comoConi, async (c) => {
      const casos: [string, string, string, number][] = [
        ["youtube", "Nombre", "Corto", 10],
        ["linkedin", "", "Corto", 10],
        ["linkedin", " Nombre", "Corto", 10],
        ["linkedin", "Nombre", "x".repeat(41), 10],
        ["linkedin", "Nombre", "Corto", 0],
        ["linkedin", "Nombre", "Corto", 100.01],
      ]
      for (const [red, nombre, corto, peso] of casos) {
        const error = await fallaCon(
          c,
          `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
           values ($1, $2, $3, 'Definición.', $4)`,
          [red, nombre, corto, peso],
        )
        expect(error.code, `${red} ${nombre} ${corto} ${peso}`).toBe("23514")
      }
    })
  })
})

describe("borradores_de_red", () => {
  it("Coni saves a network with empty notes, edits and discards it; then it is closed", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDeRed(c)
      const { rows } = await c.query(
        "select manual, receta, conexion, estado, creado_por from public.borradores_de_red where id = $1",
        [id],
      )
      expect(rows).toEqual([{ manual: "", receta: "", conexion: "", estado: "borrador", creado_por: CONI }])
      expect(
        (await c.query("update public.borradores_de_red set manual = 'Videos cortos.' where id = $1", [id])).rowCount,
      ).toBe(1)
      const aprobada = await fallaCon(c, "update public.borradores_de_red set estado = 'aprobado' where id = $1", [id])
      expect(["42501", "23514"]).toContain(aprobada.code)
      await c.query("update public.borradores_de_red set estado = 'descartado' where id = $1", [id])
      expect((await c.query("update public.borradores_de_red set nombre = 'Otra' where id = $1", [id])).rowCount).toBe(
        0,
      )
    })
  })

  it("WAV reads it and cannot write it; nobody deletes it", async () => {
    await como(comoConi, async (c) => {
      const id = await borradorDeRed(c)
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.borradores_de_red where id = $1", [id])).rowCount).toBe(1)
      expect(
        (await c.query("update public.borradores_de_red set nombre = 'De WAV' where id = $1", [id])).rowCount,
      ).toBe(0)
      expect((await fallaCon(c, "insert into public.borradores_de_red (nombre) values ('De WAV')")).code).toBe("42501")
      for (const sesion of [comoConi, comoMantenedor, comoServicio]) {
        await asumir(c, sesion)
        expect((await fallaCon(c, "delete from public.borradores_de_red where id = $1", [id])).code).toBe("42501")
      }
    })
  })
})
