import { afterAll, describe, expect, it } from "vitest"
import {
  asumir,
  como,
  comoConi,
  comoMantenedor,
  comoOtra,
  comoPostgres,
  comoServicio,
  fallaCon,
  MANTENEDOR,
  pool,
} from "./db"

afterAll(() => pool.end())

const nuevaPieza = "insert into public.piezas (titulo) values ('Prueba') returning id"

describe("acceso por rol", () => {
  it("deja a coni crear y leer piezas", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query(nuevaPieza)
      const leidas = await c.query("select id from public.piezas where id = $1", [rows[0].id])
      expect(leidas.rowCount).toBe(1)
    })
  })

  it("no le muestra nada a una usuaria autenticada que no es miembro", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(nuevaPieza)
      await asumir(c, comoOtra)
      const { rowCount } = await c.query("select id from public.piezas")
      expect(rowCount).toBe(0)
    })
  })

  it("no deja crear piezas a una usuaria autenticada que no es miembro", async () => {
    await como(comoOtra, async (c) => {
      await expect(c.query(nuevaPieza)).rejects.toThrow(/row-level security/)
    })
  })

  it("deja al mantenedor leer piezas", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(nuevaPieza)
      await asumir(c, comoMantenedor)
      const { rowCount } = await c.query("select id from public.piezas")
      expect(rowCount).toBe(1)
    })
  })

  it("no deja al mantenedor crear piezas", async () => {
    await como(comoMantenedor, async (c) => {
      await expect(c.query(nuevaPieza)).rejects.toThrow(/row-level security/)
    })
  })

  it("no deja al mantenedor modificar piezas existentes", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(nuevaPieza)
      await asumir(c, comoMantenedor)
      const { rowCount } = await c.query("update public.piezas set titulo = 'x', version = version + 1")
      expect(rowCount).toBe(0)
    })
  })

  it("no deja a nadie autenticado borrar piezas", async () => {
    await como(comoConi, async (c) => {
      await c.query(nuevaPieza)
      const { rowCount } = await c.query("delete from public.piezas")
      expect(rowCount).toBe(0)
    })
  })

  it("deja a las tareas del servidor leer y escribir piezas", async () => {
    await como(comoServicio, async (c) => {
      const { rows } = await c.query(nuevaPieza)
      expect(rows[0].id).toBeTruthy()
    })
  })

  it("deja a coni leer los ajustes pero no a una usuaria ajena", async () => {
    await como(comoConi, async (c) => {
      const { rowCount } = await c.query("select * from public.ajustes")
      expect(rowCount).toBe(1)
    })
    await como(comoOtra, async (c) => {
      const { rowCount } = await c.query("select * from public.ajustes")
      expect(rowCount).toBe(0)
    })
  })

  it("no deja al mantenedor editar los ajustes", async () => {
    await como(comoMantenedor, async (c) => {
      const { rowCount } = await c.query("update public.ajustes set tope_mensual_usd = 1")
      expect(rowCount).toBe(0)
    })
  })

  it("permite una sola coni", async () => {
    await como(comoPostgres, async (c) => {
      await expect(
        c.query("insert into public.miembros (user_id, rol) values ('b0000000-0000-4000-8000-000000000003', 'coni')"),
      ).rejects.toThrow(/miembros_una_coni/)
    })
  })
})

describe("quién define los roles", () => {
  it("no deja al mantenedor ascenderse a coni", async () => {
    await como(comoMantenedor, async (c) => {
      const { rowCount } = await c.query("update public.miembros set rol = 'coni'")
      expect(rowCount).toBe(0)
      await asumir(c, comoPostgres)
      const { rows } = await c.query("select rol from public.miembros where user_id = $1", [MANTENEDOR])
      expect(rows[0].rol).toBe("mantenedor")
    })
  })

  it("no deja a una usuaria ajena agregarse como miembro", async () => {
    await como(comoOtra, async (c) => {
      const err = await fallaCon(
        c,
        "insert into public.miembros (user_id, rol) values ('b0000000-0000-4000-8000-000000000003', 'mantenedor')",
      )
      expect(err.message).toMatch(/row-level security/)
    })
  })

  it("no deja a coni borrar su propia membresía", async () => {
    await como(comoConi, async (c) => {
      const { rowCount } = await c.query("delete from public.miembros")
      expect(rowCount).toBe(0)
    })
  })

  it("le muestra a cada miembro solo su fila", async () => {
    await como(comoMantenedor, async (c) => {
      const { rows } = await c.query("select user_id from public.miembros")
      expect(rows).toEqual([{ user_id: MANTENEDOR }])
    })
  })

  it("no deja al servicio saltarse los triggers cuando intenta cambiar el modo de replicación", async () => {
    await como(comoServicio, async (c) => {
      const err = await fallaCon(c, "set local session_replication_role = replica")
      expect(err.code).toBe("42501")
    })
  })

  it("no deja a coni desactivar los triggers de piezas", async () => {
    await como(comoConi, async (c) => {
      const err = await fallaCon(c, "alter table public.piezas disable trigger proteger_pieza")
      expect(err.code).toBe("42501")
    })
  })
})
