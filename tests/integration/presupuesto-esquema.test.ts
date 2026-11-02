import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { TIPOS_DE_AVISO } from "@/lib/avisos/tipos"
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

const MES_DE_HOY = "date_trunc('month', now() at time zone 'America/Santiago')::date"

async function gastar(c: pg.PoolClient, clave: string, monto: number, ahora = "now()"): Promise<void> {
  await c.query(`select public.reservar_gasto(null, 'heygen', 'grabar', $1, $2, ${ahora})`, [monto, clave])
}

async function esperarBloqueoDe(funcion: string): Promise<void> {
  for (let intento = 0; intento < 100; intento++) {
    const { rowCount } = await pool.query(
      "select 1 from pg_stat_activity where wait_event_type = 'Lock' and query ilike $1 and pid <> pg_backend_pid()",
      [`%${funcion}%`],
    )
    if (rowCount) return
    await new Promise((listo) => setTimeout(listo, 20))
  }
  throw new Error(`${funcion} nunca esperó la fila de ajustes.`)
}

async function limiteDelMes(c: pg.PoolClient, ahora = "now()"): Promise<number | undefined> {
  const { rows } = await c.query<{ limite: number }>(`select public.limite_del_mes(${ahora})::float8 as limite`)
  return rows[0]?.limite
}

describe("ajustes del presupuesto", () => {
  it("starts with no limit of her own and both self-running switches on", async () => {
    const { rows } = await pool.query(
      "select limite_duro_usd, motor_semanal_activo, fusiones_nocturnas_activas from public.ajustes",
    )
    expect(rows[0]).toEqual({ limite_duro_usd: null, motor_semanal_activo: true, fusiones_nocturnas_activas: true })
  })

  it("never lets the limit go under the cap", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "update public.ajustes set limite_duro_usd = 30")
      expect(error.code).toBe("23514")
      expect(error.message).toMatch(/limite_no_bajo_el_tope/)
    })
  })
})

describe("limite_del_mes", () => {
  it("is twice the cap when Coni set no limit", async () => {
    await como(comoServicio, async (c) => {
      expect(await limiteDelMes(c)).toBe(80)
    })
  })

  it("is the limit Coni set in Ajustes, and she can read it", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set limite_duro_usd = 100")
      expect(await limiteDelMes(c)).toBe(100)
    })
  })

  it("is this month's row when she reactivated, over her limit", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("update public.ajustes set limite_duro_usd = 100")
      await c.query(
        `insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`,
        [CONI],
      )
      expect(await limiteDelMes(c)).toBe(130)
    })
  })

  it("reads the month in Santiago when UTC is already in the next one", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.limites_del_mes (mes, limite_usd, fijado_por) values ('2026-10-01', 15, $1)", [
        CONI,
      ])
      expect(await limiteDelMes(c, "'2026-11-01T02:00:00Z'")).toBe(15)
      expect(await limiteDelMes(c, "'2026-11-01T03:00:00Z'")).toBe(80)
    })
  })
})

describe("reservar_gasto con el límite", () => {
  it("lets signed spend through over the limit and refuses new spend there", async () => {
    await como(comoServicio, async (c) => {
      await gastar(c, "firmado-base", 79)
      const { rows } = await c.query<{ estado: string }>(
        "select estado from public.reservar_gasto(null, 'heygen', 'grabar', 10, 'firmado-1', now(), false, null, true)",
      )
      expect(rows[0]?.estado).toBe("reservado")

      const error = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 1, 'nuevo-1')")
      expect(error.code).toBe("P0001")
      expect(error.message).toBe("limite_alcanzado")
      expect(error.detail).toContain("usado=89")
      expect(error.detail).toContain(";limite=80")
    })
  })

  it("uses this month's row instead of twice the cap", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(
        `insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`,
        [CONI],
      )
      await asumir(c, comoServicio)
      await gastar(c, "fila-del-mes", 120)
      const error = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 11, 'fila-del-mes-2')")
      expect(error.message).toBe("limite_alcanzado")
    })
  })

  it("checks the limit of the Santiago month at the boundary", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.limites_del_mes (mes, limite_usd, fijado_por) values ('2026-10-01', 15, $1)", [
        CONI,
      ])
      await asumir(c, comoServicio)
      const octubre = await fallaCon(
        c,
        "select public.reservar_gasto(null, 'heygen', 'grabar', 20, 'borde-1', '2026-11-01T02:00:00Z')",
      )
      expect(octubre.message).toBe("limite_alcanzado")
      await gastar(c, "borde-2", 20, "'2026-11-01T03:00:00Z'")
    })
  })

  it("counts a spend without a piece against the limit too, never as signed", async () => {
    await como(comoServicio, async (c) => {
      await gastar(c, "general-base", 79.95)
      const error = await fallaCon(
        c,
        "select public.reservar_gasto_general('anthropic', 'idea_propia', 0.1, 'general-1', now())",
      )
      expect(error.message).toBe("limite_alcanzado")
    })
  })
})

describe("fijar_limite_del_mes", () => {
  it("lets Coni set this month's limit, replaces it on a second call and closes the month's limit notice", async () => {
    await como(comoPostgres, async (c) => {
      const { rows: claves } = await c.query<{ clave: string }>(
        `select 'limite_alcanzado:' || to_char(${MES_DE_HOY}, 'YYYY-MM') as clave`,
      )
      const clave = claves[0]?.clave
      await c.query(
        "insert into public.avisos (tipo, clave, mensaje) values ('limite_alcanzado', $1, 'Llegaste a tu límite.')",
        [clave],
      )

      await asumir(c, comoConi)
      const { rows } = await c.query<{ limite: number; fijado_por: string }>(
        "select limite_usd::float8 as limite, fijado_por::text as fijado_por from public.fijar_limite_del_mes(120)",
      )
      expect(rows[0]).toEqual({ limite: 120, fijado_por: CONI })
      await c.query("select public.fijar_limite_del_mes(150)")

      await asumir(c, comoPostgres)
      const { rows: filas } = await c.query<{ limite: number }>(
        `select limite_usd::float8 as limite from public.limites_del_mes where mes = ${MES_DE_HOY}`,
      )
      expect(filas).toEqual([{ limite: 150 }])
      const aviso = await c.query<{ leido_en: Date | null }>("select leido_en from public.avisos where clave = $1", [
        clave,
      ])
      expect(aviso.rows[0]?.leido_en).toBeInstanceOf(Date)
    })
  })

  it("refuses a limit that does not cover what the month already used, and says how much", async () => {
    await como(comoServicio, async (c) => {
      await gastar(c, "fijar-usado", 50)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.fijar_limite_del_mes(50)")
      expect(error.code).toBe("22023")
      expect(error.message).toBe("limite_bajo")
      expect(error.detail).toContain("usado=50")
    })
  })

  it("refuses a limit under the cap, and says the cap", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.fijar_limite_del_mes(35)")
      expect(error.code).toBe("22023")
      expect(error.message).toBe("limite_bajo_el_tope")
      expect(error.detail).toContain("tope=40")
    })
  })

  it("refuses a limit above US$ 1.000", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.fijar_limite_del_mes(1000.01)")
      expect(error.code).toBe("22023")
      expect(error.message).toBe("limite_alto")
    })
  })

  it("rounds the limit to cents before it checks it", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ limite: number }>(
        "select limite_usd::float8 as limite from public.fijar_limite_del_mes(39.996)",
      )
      expect(rows[0]).toEqual({ limite: 40 })
      const { rows: tope } = await c.query<{ limite: number }>(
        "select limite_usd::float8 as limite from public.fijar_limite_del_mes(1000.004)",
      )
      expect(tope[0]).toEqual({ limite: 1000 })
    })
  })

  it("waits for a cap raise in another tab and then refuses a limit under the new cap", async () => {
    const otraPestana = await pool.connect()
    try {
      await otraPestana.query("begin")
      await otraPestana.query("update public.ajustes set tope_mensual_usd = 100")
      const error = await como(comoConi, async (c) => {
        const fijado = fallaCon(c, "select public.fijar_limite_del_mes(50)")
        await esperarBloqueoDe("fijar_limite_del_mes")
        await otraPestana.query("commit")
        return fijado
      })
      expect(error.message).toBe("limite_bajo_el_tope")
      expect(error.detail).toContain("tope=100")
    } finally {
      await otraPestana.query("rollback")
      otraPestana.release()
      await pool.query("update public.ajustes set tope_mensual_usd = 40")
      await pool.query("delete from public.limites_del_mes")
    }
  })

  it("refuses to set a limit without the settings row", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("delete from public.ajustes")
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.fijar_limite_del_mes(120)")
      expect(error.code).toBe("P0001")
      expect(error.message).toBe("ajustes_faltantes")
    })
  })

  it("is Coni's alone", async () => {
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        const error = await fallaCon(c, "select public.fijar_limite_del_mes(120)")
        expect(error.code).toBe("42501")
        expect(error.message).toBe("solo_coni")
      })
    }
  })
})

describe("limites_del_mes", () => {
  it("lets Coni and WAV read it and hides it from anybody else", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(
        `insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`,
        [CONI],
      )
      for (const [sesion, filas] of [
        [comoConi, 1],
        [comoMantenedor, 1],
        [comoOtra, 0],
      ] as const) {
        await asumir(c, sesion)
        expect((await c.query("select 1 from public.limites_del_mes")).rowCount).toBe(filas)
      }
    })
  })

  it("is written only through fijar_limite_del_mes", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(
        c,
        `insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`,
        [CONI],
      )
      expect(error.message).toMatch(/permission denied/)
    })
  })

  it("does not let Coni change or delete a month's row directly", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(
        `insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`,
        [CONI],
      )
      await asumir(c, comoConi)
      const cambio = await fallaCon(c, "update public.limites_del_mes set limite_usd = 999")
      expect(cambio.message).toMatch(/permission denied/)
      const borrado = await fallaCon(c, "delete from public.limites_del_mes")
      expect(borrado.message).toMatch(/permission denied/)

      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ limite: number }>(
        "select limite_usd::float8 as limite from public.limites_del_mes",
      )
      expect(rows).toEqual([{ limite: 130 }])
    })
  })
})

describe("avisos_tipo_check", () => {
  it("accepts exactly the notice types the app knows, the limit included", async () => {
    const { rows } = await pool.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'avisos_tipo_check'",
    )
    const tipos = [...(rows[0]?.def ?? "").matchAll(/'([a-z0-9_]+)'::text/g)].map((m) => m[1])
    expect(tipos).toContain("limite_alcanzado")
    expect(tipos).toContain("tope_alcanzado")
    expect([...tipos].sort()).toEqual([...TIPOS_DE_AVISO].sort())
  })
})
