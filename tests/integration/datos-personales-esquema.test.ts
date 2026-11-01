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
  MANTENEDOR,
  pool,
} from "./db"

afterAll(() => pool.end())

const CLAVES_SEMBRADAS = [
  "rostro_de_coni",
  "voz_de_coni",
  "conexiones_de_cuentas",
  "metricas_de_cuentas",
  "material_y_afirmaciones",
  "textos_enviados_a_ia",
  "audios_a_transcribir",
  "videos_de_piezas",
  "respaldos",
  "huella_de_visitas",
  "suscripciones_a_avisos",
]

const FILA_NUEVA =
  "insert into public.inventario_de_datos (clave, dato, para_que, proveedor, pais, plazo, orden) values ('prueba_nueva', 'Un dato de prueba', 'Probar el registro', 'Supabase', 'Por confirmar', 'Mientras dure la prueba', 99)"
const ANOTAR = "insert into public.registro_de_borrados (regla, cantidad) values ('respaldos', 2)"

describe("inventario_de_datos", () => {
  it("is seeded with the eleven kinds of data the app handles today, in order, none with its country confirmed", async () => {
    const { rows } = await pool.query<{ clave: string; pais_confirmado: boolean }>(
      "select clave, pais_confirmado from public.inventario_de_datos order by orden",
    )
    expect(rows.map((fila) => fila.clave)).toEqual(CLAVES_SEMBRADAS)
    expect(rows.filter((fila) => fila.pais_confirmado)).toEqual([])
  })

  it("lets Coni and WAV read it and hides it from anybody else", async () => {
    await como(comoPostgres, async (c) => {
      const total = (await c.query("select 1 from public.inventario_de_datos")).rowCount
      for (const [sesion, filas] of [
        [comoConi, total],
        [comoMantenedor, total],
        [comoOtra, 0],
      ] as const) {
        await asumir(c, sesion)
        expect((await c.query("select 1 from public.inventario_de_datos")).rowCount).toBe(filas)
      }
    })
  })

  it("lets WAV add, correct and remove a row, and stamps who changed it", async () => {
    await como(comoMantenedor, async (c) => {
      await c.query(FILA_NUEVA)
      const { rows } = await c.query<{ actualizado_por: string }>(
        "update public.inventario_de_datos set pais = 'Brasil', pais_confirmado = true where clave = 'prueba_nueva' returning actualizado_por",
      )
      expect(rows[0]?.actualizado_por).toBe(MANTENEDOR)
      expect((await c.query("delete from public.inventario_de_datos where clave = 'prueba_nueva'")).rowCount).toBe(1)
    })
  })

  it("does not let WAV remove a row that has a deletion rule, so it cannot come back without it", async () => {
    await como(comoMantenedor, async (c) => {
      expect((await c.query("delete from public.inventario_de_datos where clave = 'respaldos'")).rowCount).toBe(0)
      const quedan = await c.query("select 1 from public.inventario_de_datos where clave = 'respaldos'")
      expect(quedan.rowCount).toBe(1)
      expect((await c.query("delete from public.inventario_de_datos where clave = 'rostro_de_coni'")).rowCount).toBe(1)
    })
  })

  it("does not let Coni or anybody else change it", async () => {
    for (const sesion of [comoConi, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await c.query("update public.inventario_de_datos set pais = 'Chile'")).rowCount).toBe(0)
        expect((await c.query("delete from public.inventario_de_datos")).rowCount).toBe(0)
        const alta = await fallaCon(c, FILA_NUEVA)
        expect(alta.message).toMatch(/row-level security/)
      })
    }
  })

  it("never lets WAV change what the app deletes: the rule is set by migrations only", async () => {
    await como(comoMantenedor, async (c) => {
      const error = await fallaCon(
        c,
        "update public.inventario_de_datos set regla_de_borrado = null where clave = 'respaldos'",
      )
      expect(error.message).toMatch(/permission denied/)
    })
  })

  it("needs the days whenever a row has a deletion rule", async () => {
    await como(comoMantenedor, async (c) => {
      const error = await fallaCon(
        c,
        "update public.inventario_de_datos set plazo_dias = null where clave = 'respaldos'",
      )
      expect(error.message).toMatch(/regla_con_plazo/)
    })
  })
})

describe("registro_de_borrados", () => {
  it("lets only the service role write it", async () => {
    await como(comoServicio, async (c) => {
      expect((await c.query(ANOTAR)).rowCount).toBe(1)
    })
    for (const sesion of [comoConi, comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await fallaCon(c, ANOTAR)).message).toMatch(/permission denied/)
      })
    }
  })

  it("lets Coni and WAV read it and hides it from anybody else", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.registro_de_borrados (regla, cantidad) values ('prueba_lectura', 1)")
      for (const [sesion, filas] of [
        [comoConi, 1],
        [comoMantenedor, 1],
        [comoOtra, 0],
      ] as const) {
        await asumir(c, sesion)
        const leidas = await c.query("select 1 from public.registro_de_borrados where regla = 'prueba_lectura'")
        expect(leidas.rowCount).toBe(filas)
      }
    })
  })

  it("refuses a row that deleted nothing", async () => {
    await como(comoServicio, async (c) => {
      const error = await fallaCon(
        c,
        "insert into public.registro_de_borrados (regla, cantidad) values ('respaldos', 0)",
      )
      expect(error.message).toMatch(/check constraint/)
    })
  })
})

describe("marcar_inventario_revisado", () => {
  it("lets Coni mark the register as reviewed and closes the yearly notice", async () => {
    const clave = `revision_de_inventario:prueba-${Date.now()}`
    await como(comoPostgres, async (c) => {
      await c.query(
        "insert into public.avisos (tipo, clave, mensaje) values ('revision_de_inventario', $1, 'Te toca revisar tu registro.')",
        [clave],
      )
      const contar = async () =>
        (
          await c.query<{ n: number }>(
            "select count(*)::int as n from public.revisiones_de_inventario where revisado_por = $1",
            [CONI],
          )
        ).rows[0]?.n
      const antes = await contar()

      await asumir(c, comoConi)
      const { rows } = await c.query<{ revisado_en: Date }>("select public.marcar_inventario_revisado() as revisado_en")
      expect(rows[0]?.revisado_en).toBeInstanceOf(Date)

      await asumir(c, comoPostgres)
      expect(await contar()).toBe((antes ?? 0) + 1)
      const aviso = await c.query<{ leido_en: Date | null }>("select leido_en from public.avisos where clave = $1", [
        clave,
      ])
      expect(aviso.rows[0]?.leido_en).toBeInstanceOf(Date)
    })
  })

  it("leaves notices of other kinds and already read yearly notices as they were", async () => {
    const sufijo = Date.now()
    const yaLeido = new Date("2026-01-01T12:00:00Z")
    await como(comoPostgres, async (c) => {
      await c.query(
        "insert into public.avisos (tipo, clave, mensaje) values ('publicado', $1, 'Tu reel ya está publicado.')",
        [`publicado:prueba-${sufijo}`],
      )
      await c.query(
        "insert into public.avisos (tipo, clave, mensaje, leido_en) values ('revision_de_inventario', $1, 'Te toca revisar tu registro.', $2)",
        [`revision_de_inventario:leido-${sufijo}`, yaLeido],
      )

      await asumir(c, comoConi)
      await c.query("select public.marcar_inventario_revisado()")

      await asumir(c, comoPostgres)
      const otro = await c.query<{ leido_en: Date | null }>("select leido_en from public.avisos where clave = $1", [
        `publicado:prueba-${sufijo}`,
      ])
      expect(otro.rows[0]?.leido_en).toBeNull()
      const leido = await c.query<{ leido_en: Date | null }>("select leido_en from public.avisos where clave = $1", [
        `revision_de_inventario:leido-${sufijo}`,
      ])
      expect(leido.rows[0]?.leido_en).toEqual(yaLeido)
    })
  })

  it("does not let WAV or anybody else mark it, nor anyone write a review directly", async () => {
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await fallaCon(c, "select public.marcar_inventario_revisado()")).message).toBe("solo_coni_revisa")
      })
    }
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "insert into public.revisiones_de_inventario (revisado_por) values ($1)", [CONI])
      expect(error.message).toMatch(/permission denied/)
    })
  })
})

describe("ajustes for the yearly review", () => {
  it("starts the register on the day of the migration", async () => {
    const { rows } = await pool.query<{ al_dia: boolean | null }>(
      "select inventario_desde <= current_date as al_dia from public.ajustes",
    )
    expect(rows[0]?.al_dia).toBe(true)
  })
})

describe("the three new tables as anon", () => {
  it("are closed to anybody not signed in", async () => {
    for (const tabla of ["inventario_de_datos", "registro_de_borrados", "revisiones_de_inventario"]) {
      await como(comoPostgres, async (c) => {
        await c.query("set local role anon")
        expect((await fallaCon(c, `select 1 from public.${tabla}`)).message).toMatch(/permission denied/)
      })
    }
  })
})

describe("avisos_tipo_check", () => {
  it("accepts exactly the notice types the app knows, the yearly review included", async () => {
    const { rows } = await pool.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'avisos_tipo_check'",
    )
    const tipos = [...(rows[0]?.def ?? "").matchAll(/'([a-z0-9_]+)'::text/g)].map((m) => m[1])
    expect(tipos).toContain("revision_de_inventario")
    expect([...tipos].sort()).toEqual([...TIPOS_DE_AVISO].sort())
  })
})
