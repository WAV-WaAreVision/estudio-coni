import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import {
  asumir,
  CONI,
  como,
  comoConi,
  comoMantenedor,
  comoPostgres,
  comoServicio,
  fallaCon,
  MANTENEDOR,
  pool,
} from "./db"
import { crearPieza } from "./flujo"

afterAll(() => pool.end())

interface Evento {
  tabla: string
  operacion: string
  pieza_id: string | null
  actor_usuario: string | null
  actor_rol: string
  datos: Record<string, unknown> | null
}

async function eventosDe(c: pg.PoolClient, piezaId: string): Promise<Evento[]> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<Evento>(
    "select tabla, operacion, pieza_id, actor_usuario, actor_rol, datos from public.eventos where pieza_id = $1 order by id",
    [piezaId],
  )
  return rows
}

async function ultimoEventoDe(c: pg.PoolClient, piezaId: string): Promise<Evento> {
  const eventos = await eventosDe(c, piezaId)
  const ultimo = eventos.at(-1)
  if (!ultimo) throw new Error(`Sin eventos para ${piezaId}`)
  return ultimo
}

const renombrar = "update public.piezas set titulo = 'Nuevo título', version = version + 1 where id = $1"

describe("quién escribió", () => {
  it("registra a coni y el rol authenticated cuando coni actualiza una pieza", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await asumir(c, comoConi)
      await c.query(renombrar, [id])
      const evento = await ultimoEventoDe(c, id)
      expect(evento).toMatchObject({
        tabla: "piezas",
        operacion: "update",
        actor_usuario: CONI,
        actor_rol: "authenticated",
      })
      expect(evento.datos).toMatchObject({ titulo: "Nuevo título", version: 1 })
    })
  })

  it("registra rol service_role y ningún usuario cuando escribe el servicio", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await asumir(c, comoServicio)
      await c.query(renombrar, [id])
      const evento = await ultimoEventoDe(c, id)
      expect(evento).toMatchObject({ operacion: "update", actor_usuario: null, actor_rol: "service_role" })
    })
  })

  it("registra rol postgres cuando escribe postgres sin sesión", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await c.query(renombrar, [id])
      const evento = await ultimoEventoDe(c, id)
      expect(evento).toMatchObject({ operacion: "update", actor_usuario: null, actor_rol: "postgres" })
    })
  })

  it("registra el rol de la sesión cuando cambió de rol sin pasar por el token", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await c.query("set local role service_role")
      await c.query(renombrar, [id])
      const evento = await ultimoEventoDe(c, id)
      expect(evento.actor_rol).toBe("service_role")
    })
  })

  it("registra la creación con la fila nueva cuando se inserta una pieza", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      const eventos = await eventosDe(c, id)
      expect(eventos).toHaveLength(1)
      expect(eventos[0]).toMatchObject({ tabla: "piezas", operacion: "insert", actor_rol: "postgres" })
      expect(eventos[0]?.datos).toMatchObject({ id, titulo: "Prueba", version: 0 })
    })
  })

  it("registra la fila borrada cuando se elimina una pieza", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await c.query("delete from public.piezas where id = $1", [id])
      const evento = await ultimoEventoDe(c, id)
      expect(evento).toMatchObject({ operacion: "delete" })
      expect(evento.datos).toMatchObject({ id, titulo: "Prueba" })
    })
  })

  it("registra un evento sin pieza cuando coni cambia los ajustes", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set tope_mensual_usd = 55")
      const { rows } = await c.query<Evento>(
        "select tabla, operacion, pieza_id, actor_usuario, actor_rol from public.eventos where tabla = 'ajustes' order by id desc limit 1",
      )
      expect(rows[0]).toEqual({
        tabla: "ajustes",
        operacion: "update",
        pieza_id: null,
        actor_usuario: CONI,
        actor_rol: "authenticated",
      })
    })
  })
})

describe("intervenciones", () => {
  it("deja al mantenedor registrar una intervención ligada a la pieza", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await asumir(c, comoMantenedor)
      const { rows } = await c.query(
        "insert into public.intervenciones (quien, que, canal, pieza_id) values ('WAV', 'Reintentó el render en HeyGen', 'heygen', $1) returning registrada_por",
        [id],
      )
      expect(rows[0].registrada_por).toBe(MANTENEDOR)
      const evento = await ultimoEventoDe(c, id)
      expect(evento).toMatchObject({ tabla: "intervenciones", operacion: "insert", actor_usuario: MANTENEDOR })
    })
  })

  it("rechaza la intervención cuando la registra coni", async () => {
    await como(comoConi, async (c) => {
      const err = await fallaCon(
        c,
        "insert into public.intervenciones (quien, que, canal) values ('Coni', 'Algo', 'app')",
      )
      expect(err.code).toBe("42501")
      expect(err.message).toMatch(/row-level security/)
    })
  })
})

describe("registros que solo se agregan", () => {
  it("rechaza modificar un evento cuando escribe el servicio", async () => {
    await como(comoPostgres, async (c) => {
      await crearPieza(c)
      await asumir(c, comoServicio)
      const err = await fallaCon(c, "update public.eventos set actor_rol = 'otro'")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("registro_inmutable")
    })
  })

  it("rechaza borrar un evento cuando escribe el servicio", async () => {
    await como(comoPostgres, async (c) => {
      await crearPieza(c)
      await asumir(c, comoServicio)
      const err = await fallaCon(c, "delete from public.eventos")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("registro_inmutable")
    })
  })

  it("rechaza borrar un evento cuando escribe postgres", async () => {
    await como(comoPostgres, async (c) => {
      await crearPieza(c)
      const err = await fallaCon(c, "delete from public.eventos")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("registro_inmutable")
    })
  })

  it("rechaza vaciar los eventos cuando escribe postgres", async () => {
    await como(comoPostgres, async (c) => {
      await crearPieza(c)
      const err = await fallaCon(c, "truncate public.eventos")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("registro_inmutable")
    })
  })

  it("rechaza modificar una intervención cuando escribe el servicio", async () => {
    await como(comoMantenedor, async (c) => {
      await c.query("insert into public.intervenciones (quien, que, canal) values ('WAV', 'Algo', 'sql')")
      await asumir(c, comoServicio)
      const err = await fallaCon(c, "update public.intervenciones set que = 'Otra cosa'")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("registro_inmutable")
    })
  })

  it("rechaza borrar una intervención cuando escribe el servicio", async () => {
    await como(comoMantenedor, async (c) => {
      await c.query("insert into public.intervenciones (quien, que, canal) values ('WAV', 'Algo', 'sql')")
      await asumir(c, comoServicio)
      const err = await fallaCon(c, "delete from public.intervenciones")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("registro_inmutable")
    })
  })

  it("rechaza vaciar las intervenciones cuando escribe postgres", async () => {
    await como(comoPostgres, async (c) => {
      const err = await fallaCon(c, "truncate public.intervenciones")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("registro_inmutable")
    })
  })
})
