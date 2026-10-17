import type pg from "pg"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

afterEach(async () => {
  await pool.query("delete from public.gastos where clave like 'test-concurrente-%'")
})

interface Reserva {
  id: string
  clave: string
  estado: string
  mes: string
  estimado: number
  real: number | null
}

const COLUMNAS =
  "id::text as id, clave, estado, mes::text as mes, estimado_usd::float8 as estimado, real_usd::float8 as real"

async function reservar(c: pg.PoolClient, clave: string, monto: number, ahora?: string): Promise<Reserva> {
  const argumentos = ahora ? [monto, clave, ahora] : [monto, clave]
  const { rows } = await c.query<Reserva>(
    `select ${COLUMNAS} from public.reservar_gasto(null, 'heygen', 'grabar', $1, $2${ahora ? ", $3" : ""})`,
    argumentos,
  )
  const fila = rows[0]
  if (!fila) throw new Error("reservar_gasto no devolvió la reserva")
  return fila
}

const unaReserva = "select public.reservar_gasto(null, 'heygen', 'grabar', 10, 'clave-x')"

describe("reservar gasto", () => {
  it("reserva cuando cabe en el tope del mes", async () => {
    await como(comoServicio, async (c) => {
      const reserva = await reservar(c, "clave-1", 10)
      const { rows } = await c.query<{ mes: string }>(
        "select date_trunc('month', now() at time zone 'America/Santiago')::date::text as mes",
      )
      expect(reserva).toMatchObject({ clave: "clave-1", estado: "reservado", estimado: 10, real: null })
      expect(reserva.mes).toBe(rows[0]?.mes)
    })
  })

  it("reserva cuando la suma queda justo en el tope", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-1", 30)
      const reserva = await reservar(c, "clave-2", 10)
      expect(reserva.estado).toBe("reservado")
    })
  })

  it("rechaza cuando la reserva pasa el tope", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-1", 35)
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 10, 'clave-2')")
      expect(err.code).toBe("P0001")
      expect(err.message).toBe("tope_alcanzado")
      expect(err.detail).toContain("usado=35")
    })
  })

  it("respeta un tope distinto cuando coni lo cambia en los ajustes", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set tope_mensual_usd = 12")
      await asumir(c, comoServicio)
      await reservar(c, "clave-1", 10)
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 5, 'clave-2')")
      expect(err.message).toBe("tope_alcanzado")
    })
  })

  it("rechaza cuando faltan los ajustes en vez de gastar sin tope", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("delete from public.ajustes")
      await asumir(c, comoServicio)
      const err = await fallaCon(c, unaReserva)
      expect(err.code).toBe("P0001")
      expect(err.message).toBe("ajustes_faltantes")
    })
  })

  it("cuenta lo confirmado por su monto real y no cuenta lo liberado", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "a", 20)
      const confirmada = await c.query<Reserva>(`select ${COLUMNAS} from public.confirmar_gasto('a', 5)`)
      expect(confirmada.rows[0]).toMatchObject({ estado: "confirmado", real: 5 })

      await reservar(c, "b", 30)
      const liberada = await c.query<Reserva>(`select ${COLUMNAS} from public.liberar_gasto('b')`)
      expect(liberada.rows[0]).toMatchObject({ estado: "liberado" })

      // 5 confirmed (not the 20 estimated) + 35 = 40: fits only if the released 30 is ignored.
      expect((await reservar(c, "c", 35)).estado).toBe("reservado")
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 1, 'd')")
      expect(err.message).toBe("tope_alcanzado")
    })
  })

  it("no cambia nada cuando confirma o libera una reserva que ya no está reservada", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "a", 10)
      await c.query("select public.liberar_gasto('a')")
      const { rowCount } = await c.query("select * from public.confirmar_gasto('a', 3) where id is not null")
      expect(rowCount).toBe(0)
    })
  })

  it("devuelve la misma reserva cuando se repite la clave", async () => {
    await como(comoServicio, async (c) => {
      const primera = await reservar(c, "repetida", 25)
      const segunda = await reservar(c, "repetida", 25)
      expect(segunda.id).toBe(primera.id)
      const { rows } = await c.query<{ n: string }>(
        "select count(*)::text as n from public.gastos where clave = 'repetida'",
      )
      expect(rows[0]?.n).toBe("1")
      // The repeat did not consume the cap a second time.
      expect((await reservar(c, "otra", 15)).estado).toBe("reservado")
    })
  })

  it("usa el mes de santiago cuando en utc ya empezó noviembre", async () => {
    await como(comoServicio, async (c) => {
      const reserva = await reservar(c, "limite-1", 10, "2026-11-01T02:00:00Z")
      expect(reserva.mes).toBe("2026-10-01")
    })
  })

  it("cambia de mes cuando en santiago ya es primero de noviembre", async () => {
    await como(comoServicio, async (c) => {
      const reserva = await reservar(c, "limite-2", 10, "2026-11-01T03:00:00Z")
      expect(reserva.mes).toBe("2026-11-01")
    })
  })

  it("separa el tope de cada mes cuando se reserva en otro mes", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "octubre", 40, "2026-10-15T12:00:00Z")
      const noviembre = await reservar(c, "noviembre", 40, "2026-11-15T12:00:00Z")
      expect(noviembre.estado).toBe("reservado")
    })
  })

  it("cuenta contra el tope del mes cuando el proveedor es voyage, reservado y confirmado", async () => {
    await como(comoServicio, async (c) => {
      await c.query("select public.reservar_gasto_general('voyage', 'embeddings', 35, 'voyage-1', now())")
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 10, 'clave-2')")
      expect(err.code).toBe("P0001")
      await c.query("select public.confirmar_gasto('voyage-1', 30)")
      const { rows } = await c.query<{ estado: string; real: number }>(
        "select estado, real_usd::float8 as real from public.gastos where clave = 'voyage-1'",
      )
      expect(rows[0]).toEqual({ estado: "confirmado", real: 30 })
      await c.query("select public.reservar_gasto(null, 'heygen', 'grabar', 10, 'clave-3')")
      const falla = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 1, 'clave-4')")
      expect(falla.code).toBe("P0001")
    })
  })

  it("rechaza un monto que no es positivo", async () => {
    await como(comoServicio, async (c) => {
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 0, 'cero')")
      expect(err.code).toBe("23514")
    })
  })
})

describe("reservas simultáneas", () => {
  async function reservarYSoltar(clave: string, retenerMs: number): Promise<void> {
    const cliente = await pool.connect()
    try {
      await cliente.query("begin")
      await cliente.query("set local role service_role")
      await cliente.query("select public.reservar_gasto(null, 'heygen', 'grabar', 25, $1)", [clave])
      // Holding the transaction open makes the second reservation arrive while the first is uncommitted.
      await new Promise((resolver) => setTimeout(resolver, retenerMs))
      await cliente.query("commit")
    } catch (error) {
      await cliente.query("rollback")
      throw error
    } finally {
      cliente.release()
    }
  }

  it("deja pasar solo una de dos reservas simultáneas que juntas pasan el tope", async () => {
    const resultados = await Promise.allSettled([
      reservarYSoltar("test-concurrente-1", 300),
      reservarYSoltar("test-concurrente-2", 300),
    ])
    const aceptadas = resultados.filter((r) => r.status === "fulfilled")
    const rechazadas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(aceptadas).toHaveLength(1)
    expect(rechazadas).toHaveLength(1)
    expect(rechazadas[0]?.reason).toMatchObject({ message: "tope_alcanzado" })

    const { rows } = await pool.query<{ n: string }>(
      "select count(*)::text as n from public.gastos where clave like 'test-concurrente-%'",
    )
    expect(rows[0]?.n).toBe("1")
  })
})

describe("quién puede reservar", () => {
  it("rechaza reservar cuando lo intenta coni", async () => {
    await como(comoConi, async (c) => {
      const err = await fallaCon(c, unaReserva)
      expect(err.code).toBe("42501")
    })
  })

  it("rechaza reservar cuando lo intenta el mantenedor", async () => {
    await como(comoMantenedor, async (c) => {
      const err = await fallaCon(c, unaReserva)
      expect(err.code).toBe("42501")
    })
  })

  it("rechaza reservar cuando no hay sesión", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("set local role anon")
      const err = await fallaCon(c, unaReserva)
      expect(err.code).toBe("42501")
    })
  })

  it("rechaza confirmar y liberar cuando lo intenta coni", async () => {
    await como(comoConi, async (c) => {
      const confirmar = await fallaCon(c, "select public.confirmar_gasto('x', 1)")
      expect(confirmar.code).toBe("42501")
      const liberar = await fallaCon(c, "select public.liberar_gasto('x')")
      expect(liberar.code).toBe("42501")
    })
  })

  it("deja a coni y al mantenedor ver los gastos pero no escribirlos", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "visible", 10)
      await asumir(c, comoConi)
      const { rowCount } = await c.query("select * from public.gastos")
      expect(rowCount).toBe(1)
      const err = await fallaCon(
        c,
        "insert into public.gastos (proveedor, paso, mes, estimado_usd, clave) values ('heygen', 'x', now(), 1, 'z')",
      )
      expect(err.message).toMatch(/row-level security|permission denied/)
    })
  })
})

describe("liberar sin cobro", () => {
  it("marks a release as sin_cobro only when asked, and a plain release leaves it false", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-sin-cobro", 1)
      await reservar(c, "clave-barrida", 1)
      await c.query("select public.liberar_gasto('clave-sin-cobro', true)")
      await c.query("select public.liberar_gasto('clave-barrida')")
      const { rows } = await c.query<{ clave: string; estado: string; sin_cobro: boolean }>(
        "select clave, estado, sin_cobro from public.gastos where clave in ('clave-sin-cobro', 'clave-barrida') order by clave",
      )
      expect(rows).toEqual([
        { clave: "clave-barrida", estado: "liberado", sin_cobro: false },
        { clave: "clave-sin-cobro", estado: "liberado", sin_cobro: true },
      ])
    })
  })

  it("does not mark a confirmed spend as sin_cobro", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-pagada", 1)
      await c.query("select public.confirmar_gasto('clave-pagada', 1)")
      await c.query("select public.liberar_gasto('clave-pagada', true)")
      const { rows } = await c.query("select estado, sin_cobro from public.gastos where clave = 'clave-pagada'")
      expect(rows).toEqual([{ estado: "confirmado", sin_cobro: false }])
    })
  })

  it.each([
    ["Coni", comoConi],
    ["the maintainer", comoMantenedor],
  ])("still refuses %s the new release", async (_quien, sesion) => {
    await como(sesion, async (c) => {
      const err = await fallaCon(c, "select public.liberar_gasto('clave-x', true)")
      expect(err.code).toBe("42501")
    })
  })
})

describe("reabrir una reserva liberada", () => {
  const reabrir = (c: pg.PoolClient, clave: string, monto: number) =>
    c.query<Reserva>(`select ${COLUMNAS} from public.reservar_gasto(null, 'elevenlabs', 'voz', $1, $2, now(), true)`, [
      monto,
      clave,
    ])

  it("reopens a released key as reserved, at the new estimate, without sin_cobro", async () => {
    await como(comoServicio, async (c) => {
      const primera = await reservar(c, "clave-reabrir", 1)
      await c.query("select public.liberar_gasto('clave-reabrir', true)")

      const { rows } = await reabrir(c, "clave-reabrir", 2)

      expect(rows[0]).toMatchObject({
        id: primera.id,
        clave: "clave-reabrir",
        estado: "reservado",
        estimado: 2,
        real: null,
      })
      const { rows: marca } = await c.query("select sin_cobro from public.gastos where clave = 'clave-reabrir'")
      expect(marca).toEqual([{ sin_cobro: false }])
    })
  })

  it("restarts the creation time so the sweeper's hour starts again", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-reloj", 1)
      await c.query("update public.gastos set creado_en = now() - interval '3 hours' where clave = 'clave-reloj'")
      await c.query("select public.liberar_gasto('clave-reloj', true)")
      await reabrir(c, "clave-reloj", 1)
      const { rows } = await c.query<{ reciente: boolean }>(
        "select creado_en > now() - interval '1 minute' as reciente from public.gastos where clave = 'clave-reloj'",
      )
      expect(rows).toEqual([{ reciente: true }])
    })
  })

  it("checks the cap again before reopening", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-tope", 1)
      await c.query("select public.liberar_gasto('clave-tope', true)")
      await reservar(c, "clave-llena", 39.5)
      const err = await fallaCon(
        c,
        "select public.reservar_gasto(null, 'elevenlabs', 'voz', 1, 'clave-tope', now(), true)",
      )
      expect(err.message).toBe("tope_alcanzado")
    })
  })

  it("returns a released key unchanged when reopening is not asked", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-cerrada", 1)
      await c.query("select public.liberar_gasto('clave-cerrada')")
      const otra = await reservar(c, "clave-cerrada", 1)
      expect(otra.estado).toBe("liberado")
    })
  })

  it("never reopens a key the sweeper released, because its outcome is unknown", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-barrida-voz", 1)
      await c.query("select public.liberar_gasto('clave-barrida-voz')")

      const { rows } = await reabrir(c, "clave-barrida-voz", 2)

      expect(rows[0]).toMatchObject({ clave: "clave-barrida-voz", estado: "liberado", estimado: 1 })
      const { rows: abiertas } = await c.query(
        "select count(*)::int as n from public.gastos where clave = 'clave-barrida-voz' and estado = 'reservado'",
      )
      expect(abiertas).toEqual([{ n: 0 }])
    })
  })

  it("never reopens a confirmed key", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-confirmada", 1)
      await c.query("select public.confirmar_gasto('clave-confirmada', 1)")
      const { rows } = await reabrir(c, "clave-confirmada", 1)
      expect(rows[0]).toMatchObject({ estado: "confirmado", real: 1 })
    })
  })
})
