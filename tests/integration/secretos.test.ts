import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

describe("llaves en vault", () => {
  it("guarda la llave cuando la ingresa coni", async () => {
    await como(comoConi, async (c) => {
      await c.query("select public.guardar_secreto('heygen', 'k1')")
      await asumir(c, comoServicio)
      const { rows } = await c.query("select public.leer_secreto('heygen') as valor")
      expect(rows[0].valor).toBe("k1")
    })
  })

  it("la reemplaza cuando la vuelve a ingresar", async () => {
    await como(comoConi, async (c) => {
      await c.query("select public.guardar_secreto('heygen', 'k1')")
      await c.query("select public.guardar_secreto('heygen', 'k2')")
      await asumir(c, comoServicio)
      const { rows } = await c.query("select public.leer_secreto('heygen') as valor")
      expect(rows[0].valor).toBe("k2")
      await asumir(c, comoPostgres)
      const nombres = await c.query("select count(*)::int as n from vault.secrets where name = 'heygen'")
      expect(nombres.rows[0].n).toBe(1)
    })
  })

  it("guarda cada cuenta por separado cuando coni ingresa dos llaves", async () => {
    await como(comoConi, async (c) => {
      await c.query("select public.guardar_secreto('heygen', 'k-heygen')")
      await c.query("select public.guardar_secreto('elevenlabs', 'k-eleven')")
      await asumir(c, comoServicio)
      const { rows } = await c.query("select public.leer_secreto('elevenlabs') as valor")
      expect(rows[0].valor).toBe("k-eleven")
    })
  })

  it("rechaza un nombre que no es de una cuenta conocida", async () => {
    await como(comoConi, async (c) => {
      const err = await fallaCon(c, "select public.guardar_secreto('tiktok', 'k1')")
      expect(err.code).toBe("22023")
      expect(err.message).toBe("cuenta_desconocida")
    })
  })

  it("no entrega nada cuando la cuenta no tiene llave", async () => {
    await como(comoServicio, async (c) => {
      const { rows } = await c.query("select public.leer_secreto('meta') as valor")
      expect(rows[0].valor).toBeNull()
    })
  })

  it("rechaza leer la llave cuando lo intenta coni", async () => {
    await como(comoConi, async (c) => {
      await c.query("select public.guardar_secreto('heygen', 'k1')")
      const err = await fallaCon(c, "select public.leer_secreto('heygen')")
      expect(err.code).toBe("42501")
    })
  })

  it("rechaza leer la llave cuando lo intenta el mantenedor", async () => {
    await como(comoMantenedor, async (c) => {
      const err = await fallaCon(c, "select public.leer_secreto('heygen')")
      expect(err.code).toBe("42501")
    })
  })

  it("rechaza leer la llave cuando no hay sesión", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("set local role anon")
      const err = await fallaCon(c, "select public.leer_secreto('heygen')")
      expect(err.code).toBe("42501")
    })
  })

  it("no deja guardar llaves al mantenedor", async () => {
    await como(comoMantenedor, async (c) => {
      const err = await fallaCon(c, "select public.guardar_secreto('heygen', 'k1')")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_guarda_llaves")
    })
  })

  it("no deja guardar llaves al servicio", async () => {
    await como(comoServicio, async (c) => {
      const err = await fallaCon(c, "select public.guardar_secreto('heygen', 'k1')")
      expect(err.code).toBe("42501")
    })
  })

  it("no deja a coni leer los secretos descifrados desde vault", async () => {
    await como(comoConi, async (c) => {
      await c.query("select public.guardar_secreto('heygen', 'k1')")
      const err = await fallaCon(c, "select decrypted_secret from vault.decrypted_secrets")
      expect(err.code).toBe("42501")
    })
  })

  it("no guarda el valor de la llave en el registro de eventos", async () => {
    await como(comoConi, async (c) => {
      await c.query("select public.guardar_secreto('heygen', 'valor-secreto-de-prueba')")
      const { rows } = await c.query(
        "select count(*)::int as n from public.eventos where datos::text like '%valor-secreto-de-prueba%'",
      )
      expect(rows[0].n).toBe(0)
    })
  })
})
