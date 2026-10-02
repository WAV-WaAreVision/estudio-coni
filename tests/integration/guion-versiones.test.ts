import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import {
  asumir,
  CONI,
  como,
  comoConi,
  comoMantenedor,
  comoOtra,
  comoPostgres,
  comoServicio,
  fallaCon,
  pool,
} from "./db"
import { crearPieza, crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

const EDITAR = "select * from public.editar_guion_como_coni($1, $2, $3, $4, $5::jsonb)"
const BLOQUEA = JSON.stringify([{ regla: "cierre", tipo: "bloquea", mensaje: "Falta el cierre." }])
const CLAVE = "clave-versiones"

type Version = { numero: number; guion: string; texto: string | null; autor: string; creada_por: string | null }

async function versiones(c: pg.PoolClient, id: string): Promise<Version[]> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<Version>(
    "select numero, guion, texto, autor, creada_por from public.guion_versiones where pieza_id = $1 order by numero",
    [id],
  )
  return rows
}

describe("guion_versiones", () => {
  it("records Claude's draft as version 1 and the next draft as version 2", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await c.query("update public.piezas set estado = 'guion_en_proceso', version = 1 where id = $1", [id])
      await asumir(c, comoServicio)
      await c.query("select public.reservar_gasto($1, 'anthropic', 'guion', 0.5, $2)", [id, CLAVE])
      await c.query("select public.reservar_gasto($1, 'anthropic', 'guion', 0.5, $2)", [id, `${CLAVE}-2`])
      await c.query("select public.guardar_borrador($1, 1, 'Uno', 'T1', '[]'::jsonb, $2, 0.01)", [id, CLAVE])
      await c.query("select public.guardar_borrador($1, 2, 'Dos', 'T2', '[]'::jsonb, $2, 0.01)", [id, `${CLAVE}-2`])

      expect(await versiones(c, id)).toEqual([
        { numero: 1, guion: "Uno", texto: "T1", autor: "claude", creada_por: null },
        { numero: 2, guion: "Dos", texto: "T2", autor: "claude", creada_por: null },
      ])
    })
  })

  it("lets Coni and the maintainer read versions and nobody write them directly", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      await c.query(EDITAR, [id, (await leer(c, id)).version, "G", "T", "[]"])

      for (const sesion of [comoConi, comoMantenedor]) {
        await asumir(c, sesion)
        const { rows } = await c.query("select numero from public.guion_versiones where pieza_id = $1", [id])
        expect(rows).toHaveLength(1)
      }
      await asumir(c, comoOtra)
      const { rows: ajenas } = await c.query("select numero from public.guion_versiones where pieza_id = $1", [id])
      expect(ajenas).toHaveLength(0)

      for (const sesion of [comoConi, comoMantenedor]) {
        await asumir(c, sesion)
        for (const sql of [
          "insert into public.guion_versiones (pieza_id, numero, guion, autor) values ($1, 99, 'x', 'coni')",
          "update public.guion_versiones set guion = 'x' where pieza_id = $1",
          "delete from public.guion_versiones where pieza_id = $1",
        ]) {
          const err = await fallaCon(c, sql, [id])
          expect(err.code).toBe("42501")
        }
      }
    })
  })
})

describe("editar_guion_como_coni", () => {
  it("saves script, text and review as Coni, bumps the version and records her version", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const antes = await leer(c, id)
      await asumir(c, comoConi)

      const { rows } = await c.query(EDITAR, [id, antes.version, "Guion de Coni", "Texto de Coni", BLOQUEA])

      expect(rows[0]).toMatchObject({
        guion: "Guion de Coni",
        texto: "Texto de Coni",
        version: antes.version + 1,
        estado: "guion_por_aprobar",
      })
      expect(rows[0].revision).toEqual(JSON.parse(BLOQUEA))
      expect(await versiones(c, id)).toEqual([
        { numero: 1, guion: "Guion de Coni", texto: "Texto de Coni", autor: "coni", creada_por: CONI },
      ])
      const { rows: eventos } = await c.query(
        "select actor_usuario, actor_rol from public.eventos where pieza_id = $1 and tabla = 'piezas' order by id desc limit 1",
        [id],
      )
      expect(eventos[0]).toEqual({ actor_usuario: CONI, actor_rol: "authenticated" })
    })
  })

  it("numbers her edit after the existing versions", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await c.query(
        "insert into public.guion_versiones (pieza_id, numero, guion, autor) values ($1, 1, 'C', 'claude')",
        [id],
      )
      await asumir(c, comoConi)
      await c.query(EDITAR, [id, (await leer(c, id)).version, "G", "T", "[]"])
      expect((await versiones(c, id)).map((v) => [v.numero, v.autor])).toEqual([
        [1, "claude"],
        [2, "coni"],
      ])
    })
  })

  it("refuses the maintainer and the service", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      for (const sesion of [comoMantenedor, comoServicio]) {
        await asumir(c, sesion)
        const err = await fallaCon(c, EDITAR, [id, version, "G", "T", "[]"])
        expect(err.code).toBe("42501")
        expect(err.message).toBe("solo_coni_edita_guion")
      }
    })
  })

  it("refuses a piece that is not waiting for gate 1", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const err = await fallaCon(c, EDITAR, [id, version, "G", "T", "[]"])
      expect(err.message).toBe("guion_fuera_de_revision")
    })
  })

  it("refuses a stale version with version_desfasada", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const err = await fallaCon(c, EDITAR, [id, version - 1, "G", "T", "[]"])
      expect(err.code).toBe("40001")
      expect(err.message).toBe("version_desfasada")
    })
  })

  it("refuses a review that is not a list", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const err = await fallaCon(c, EDITAR, [id, version, "G", "T", "{}"])
      expect(err.message).toBe("revision_invalida")
    })
  })

  it("keeps gate 1 closed when her edit leaves a blocking finding", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      await c.query(EDITAR, [id, (await leer(c, id)).version, "G", "T", BLOQUEA])
      const err = await fallaCon(
        c,
        "update public.piezas set puerta1_hash = 'h', puerta1_en = now(), estado = 'en_render', version = version + 1 where id = $1",
        [id],
      )
      expect(err.message).toBe("revision_bloquea")
    })
  })
})
