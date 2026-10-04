// tests/integration/aprobar-voz-esquema.test.ts
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { AVATAR, crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

const HASH = "f".repeat(64)
const REVISION = "[]"

/** Gate 1 written the way the app will write it from Task 3 on: Coni's session, approval and avatar in one update. */
async function aprobada(c: pg.PoolClient): Promise<string> {
  const id = await crearPiezaEn(c, "guion_por_aprobar")
  await asumir(c, comoConi)
  await c.query(
    `update public.piezas set estado = 'guion_aprobado', puerta1_hash = $2, puerta1_en = now(), avatar_id = $3,
       puerta1_formula = 3, version = version + 1 where id = $1`,
    [id, HASH, AVATAR],
  )
  await asumir(c, comoPostgres)
  return id
}

describe("estados guion_aprobado y grabando_voz", () => {
  it("lets Coni approve into guion_aprobado and records her as the approver", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      const fila = await leer(c, id)
      expect(fila.estado).toBe("guion_aprobado")
      expect(fila.puerta1_hash).toBe(HASH)
      expect(fila.puerta1_por).not.toBeNull()
    })
  })

  it("refuses guion_aprobado or grabando_voz without a gate 1 approval", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      for (const estado of ["guion_aprobado", "grabando_voz"]) {
        const error = await fallaCon(c, `update public.piezas set estado = $2, version = version + 1 where id = $1`, [
          id,
          estado,
        ])
        expect(error.constraint).toBe("aprobada_para_grabar")
      }
    })
  })

  it("only lets Coni move a piece into grabando_voz, and lets the tasks bring it back", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      await asumir(c, comoServicio)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'grabando_voz', version = version + 1 where id = $1",
        [id],
      )
      expect(error.message).toBe("solo_coni_entra_a_puerta")

      await asumir(c, comoConi)
      await c.query("update public.piezas set estado = 'grabando_voz', version = version + 1 where id = $1", [id])
      await asumir(c, comoServicio)
      await c.query(
        "update public.piezas set estado = 'guion_aprobado', audio_id = 'voces/x.mp3', version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoPostgres)
      expect((await leer(c, id)).estado).toBe("guion_aprobado")
    })
  })

  it("drops the approval when Coni edits the script of an approved piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const { rows } = await c.query("select * from public.editar_guion_como_coni($1, $2, $3, $4, $5::jsonb)", [
        id,
        version,
        "Guion nuevo de Coni.",
        "Texto nuevo.",
        REVISION,
      ])
      expect(rows[0]).toMatchObject({
        estado: "guion_por_aprobar",
        puerta1_hash: null,
        puerta1_en: null,
        puerta1_por: null,
        guion: "Guion nuevo de Coni.",
      })
    })
  })

  it("drops the approval when Coni edits the caption of an approved piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const { rows } = await c.query("select * from public.editar_texto_como_coni($1, $2, $3, $4::jsonb)", [
        id,
        version,
        "Otro texto.",
        REVISION,
      ])
      expect(rows[0]).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null, texto: "Otro texto." })
    })
  })

  it("clears the reason a failed voice left when the caption is edited", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      await c.query(
        "update public.piezas set explicacion = 'No pude grabar la voz.', version = version + 1 where id = $1",
        [id],
      )
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const { rows } = await c.query("select * from public.editar_texto_como_coni($1, $2, $3, $4::jsonb)", [
        id,
        version,
        "Otro texto.",
        REVISION,
      ])
      expect(rows[0]).toMatchObject({ estado: "guion_por_aprobar", explicacion: null })
    })
  })

  it("clears the reason a failed voice left when the script is edited", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobada(c)
      await c.query(
        "update public.piezas set explicacion = 'No pude grabar la voz.', version = version + 1 where id = $1",
        [id],
      )
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const { rows } = await c.query("select * from public.editar_guion_como_coni($1, $2, $3, $4, $5::jsonb)", [
        id,
        version,
        "Guion nuevo.",
        "Texto nuevo.",
        REVISION,
      ])
      expect(rows[0]).toMatchObject({ estado: "guion_por_aprobar", explicacion: null })
    })
  })

  it("still refuses to edit the script of a piece in render", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select * from public.editar_guion_como_coni($1, $2, $3, $4, $5::jsonb)", [
        id,
        version,
        "Guion.",
        "Texto.",
        REVISION,
      ])
      expect(error.message).toBe("guion_fuera_de_revision")
    })
  })
})
