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

afterAll(() => pool.end())

const NUEVA = `insert into public.suscripciones_push (endpoint, p256dh, auth, user_agent)
  values ($1, 'clave-publica', 'clave-de-autenticacion', 'Safari iOS')`
// The owner has no auth.uid(), so a row written outside Coni's session names its owner.
const SEMBRADA = `insert into public.suscripciones_push (user_id, endpoint, p256dh, auth, user_agent)
  values ('${CONI}', $1, 'clave-publica', 'clave-de-autenticacion', 'Safari iOS')`
const ENDPOINT = "https://web.push.apple.com/QWERTY"

describe("suscripciones_push", () => {
  it("lets Coni subscribe her own device, stamped with her id by the database", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ user_id: string; fallos: number }>(`${NUEVA} returning user_id, fallos`, [
        ENDPOINT,
      ])
      expect(rows[0]?.user_id).toBe("c0000000-0000-4000-8000-000000000001")
      expect(rows[0]?.fallos).toBe(0)
      expect((await c.query("select * from public.suscripciones_push")).rowCount).toBe(1)
    })
  })

  it("does not let anybody else subscribe", async () => {
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        const error = await fallaCon(c, NUEVA, [ENDPOINT])
        expect(error.message).toMatch(/row-level security|permission denied/)
      })
    }
  })

  it("keeps the endpoint and its keys from the maintainer and from members of nothing", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(SEMBRADA, [ENDPOINT])
      for (const sesion of [comoMantenedor, comoOtra]) {
        await asumir(c, sesion)
        expect((await c.query("select * from public.suscripciones_push")).rowCount).toBe(0)
      }
    })
  })

  it("lets Coni unsubscribe but not rewrite a subscription", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(SEMBRADA, [ENDPOINT])
      await asumir(c, comoConi)
      const cambio = await fallaCon(c, "update public.suscripciones_push set fallos = 0")
      expect(cambio.message).toMatch(/permission denied/)
      expect((await c.query("delete from public.suscripciones_push")).rowCount).toBe(1)
    })
  })

  it("lets the service role read the keys, count failures and delete a dead subscription", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(SEMBRADA, [ENDPOINT])
      await asumir(c, comoServicio)
      const { rows } = await c.query("select p256dh, auth from public.suscripciones_push")
      expect(rows).toEqual([{ p256dh: "clave-publica", auth: "clave-de-autenticacion" }])
      await c.query("update public.suscripciones_push set fallos = fallos + 1, ultimo_ok_en = now()")
      expect((await c.query("delete from public.suscripciones_push")).rowCount).toBe(1)
    })
  })

  it("stores one row per endpoint", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(SEMBRADA, [ENDPOINT])
      const repetida = await fallaCon(c, SEMBRADA, [ENDPOINT])
      expect(repetida.code).toBe("23505")
    })
  })

  it("accepts only https endpoints", async () => {
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(c, SEMBRADA, ["http://push.example/abc"])
      expect(error.message).toMatch(/check constraint/)
    })
  })

  it("is not copied into the audit log, which the maintainer reads", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(SEMBRADA, [ENDPOINT])
      const { rows } = await c.query("select 1 from public.eventos where datos::text like '%clave-de-autenticacion%'")
      expect(rows).toEqual([])
    })
  })
})
