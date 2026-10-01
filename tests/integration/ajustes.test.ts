import { afterAll, afterEach, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { crearPiezaEn } from "./flujo"

afterAll(() => pool.end())

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'meta'")
  await pool.query(
    "update public.ajustes set meta_cuenta_id = null, meta_token_expira_en = null, dias_publicacion = '{2,4,6}', tope_mensual_usd = 40",
  )
})

const CONECTAR = "select public.conectar_instagram($1, $2, $3)"
const EXPIRA = "2026-12-01T12:00:00Z"

async function secretoMeta(): Promise<string | undefined> {
  const { rows } = await pool.query("select decrypted_secret from vault.decrypted_secrets where name = 'meta'")
  return rows[0]?.decrypted_secret
}

describe("conectar_instagram", () => {
  it("saves the token in Vault and the account and expiry in ajustes together", async () => {
    await como(comoConi, async (c) => {
      await c.query(CONECTAR, ["IGQ_largo", "17841400000000000", EXPIRA])
      await asumir(c, comoPostgres)
      const { rows } = await c.query("select meta_cuenta_id, meta_token_expira_en from public.ajustes")
      expect(rows[0].meta_cuenta_id).toBe("17841400000000000")
      expect(new Date(rows[0].meta_token_expira_en).toISOString()).toBe("2026-12-01T12:00:00.000Z")
      const { rows: secreto } = await c.query(
        "select decrypted_secret from vault.decrypted_secrets where name = 'meta'",
      )
      expect(secreto[0].decrypted_secret).toBe("IGQ_largo")
    })
  })

  it("replaces the token and the dates when she connects again", async () => {
    await como(comoConi, async (c) => {
      await c.query(CONECTAR, ["IGQ_viejo", "111", EXPIRA])
      await c.query(CONECTAR, ["IGQ_nuevo", "222", "2027-01-01T00:00:00Z"])
      await asumir(c, comoPostgres)
      const { rows } = await c.query("select count(*)::int as n from vault.secrets where name = 'meta'")
      expect(rows[0].n).toBe(1)
      const { rows: ajustes } = await c.query("select meta_cuenta_id from public.ajustes")
      expect(ajustes[0].meta_cuenta_id).toBe("222")
    })
  })

  it("is refused to the maintainer and to the service role, and leaves nothing behind", async () => {
    for (const sesion of [comoMantenedor, comoServicio]) {
      await como(sesion, async (c) => {
        const err = await fallaCon(c, CONECTAR, ["IGQ_largo", "111", EXPIRA])
        expect(err.message).toBe("solo_coni_conecta_instagram")
      })
    }
    expect(await secretoMeta()).toBeUndefined()
  })

  it("refuses an empty token or account", async () => {
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, CONECTAR, ["  ", "111", EXPIRA])).message).toBe("conexion_incompleta")
      expect((await fallaCon(c, CONECTAR, ["IGQ", "", EXPIRA])).message).toBe("conexion_incompleta")
    })
  })
})

describe("ajustes que edita Coni", () => {
  it("has both notification switches on by default", async () => {
    const { rows } = await pool.query("select avisos_resumen, avisos_urgentes from public.ajustes")
    expect(rows[0]).toEqual({ avisos_resumen: true, avisos_urgentes: true })
  })

  it("lets Coni change the days and refuses days that do not exist or none at all", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set dias_publicacion = '{1,3,5}'")
      const nombre = "dias_publicacion_validos"
      for (const malos of ["{}", "{0}", "{8}"]) {
        const err = await fallaCon(c, "update public.ajustes set dias_publicacion = $1", [malos])
        expect(err.constraint).toBe(nombre)
      }
    })
  })

  it("does not let the maintainer change them", async () => {
    await como(comoMantenedor, async (c) => {
      const { rowCount } = await c.query("update public.ajustes set tope_mensual_usd = 999")
      expect(rowCount).toBe(0)
    })
  })

  it("logs a change of the monthly cap with Coni as the actor", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set tope_mensual_usd = 55")
      await asumir(c, comoPostgres)
      const { rows } = await c.query(
        "select actor_usuario, actor_rol, datos ->> 'tope_mensual_usd' as tope from public.eventos where tabla = 'ajustes' order by id desc limit 1",
      )
      expect(rows[0]).toEqual({ actor_usuario: CONI, actor_rol: "authenticated", tope: "55.00" })
    })
  })

  it("never moves the date of a piece she already approved when the days change", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      const antes = await c.query("select puerta2_publicar_en, puerta2_hash_texto from public.piezas where id = $1", [
        id,
      ])
      await asumir(c, comoConi)
      await c.query("update public.ajustes set dias_publicacion = '{1}', hora_publicacion = '08:00'")
      await asumir(c, comoPostgres)
      const despues = await c.query("select puerta2_publicar_en, puerta2_hash_texto from public.piezas where id = $1", [
        id,
      ])
      expect(despues.rows[0]).toEqual(antes.rows[0])
    })
  })
})
