import { readFileSync } from "node:fs"
import { join } from "node:path"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { VENTANA_DESHACER_MS } from "@/lib/dominio/estados"
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
import { crearPiezaEn } from "./flujo"
import { borrarSembrado, moverHoraAprobada, sembrarPieza } from "./siembra"

afterAll(() => pool.end())

type Cliente = pg.PoolClient
const MIGRACION = readFileSync(join(process.cwd(), "supabase/migrations/20261017000400_lote.sql"), "utf-8")

async function crearIdea(c: Cliente, pilar = "ia-salud-mental"): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, tema, formato, fuerza, estado, origen, fijada_en)
     values ($1, 'Gancho', 'Tema', 'reel', 'media', 'idea', 'motor', now()) returning id`,
    [pilar],
  )
  const fila = rows[0]
  if (!fila) throw new Error("No se creó la idea")
  return fila.id
}

async function idea(c: Cliente, id: string) {
  const { rows } = await c.query(
    "select estado, motivo_descarte, fijada_en, descartada_en, descartada_por from public.ideas where id = $1",
    [id],
  )
  return rows[0]
}

describe("descartar_ideas", () => {
  it("discards every idea of the batch with one motive, stamps who and when, and unpins them", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = [await crearIdea(c), await crearIdea(c)]
      await asumir(c, comoConi)
      await c.query("select public.descartar_ideas($1::uuid[], 'repetida')", [[a, b]])
      await asumir(c, comoPostgres)
      for (const id of [a, b]) {
        expect(await idea(c, id)).toMatchObject({
          estado: "descartada",
          motivo_descarte: "repetida",
          fijada_en: null,
          descartada_por: CONI,
        })
        expect((await idea(c, id)).descartada_en).toBeInstanceOf(Date)
      }
    })
  })

  it("discards none when one of them already left the bank", async () => {
    await como(comoPostgres, async (c) => {
      const [libre, usada] = [await crearIdea(c), await crearIdea(c)]
      await c.query("update public.ideas set estado = 'usada' where id = $1", [usada])
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.descartar_ideas($1::uuid[], 'debil')", [[libre, usada]])
      expect(error).toMatchObject({ code: "22023", message: "no_descartable" })
      await asumir(c, comoPostgres)
      expect((await idea(c, libre)).estado).toBe("idea")
    })
  })

  it("refuses an empty batch, more than five, a repeated id or a null with lote_invalido", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      for (const ids of [[], [id, id], Array.from({ length: 6 }, () => id), [id, null]]) {
        const error = await fallaCon(c, "select public.descartar_ideas($1::uuid[], 'debil')", [ids])
        expect(error).toMatchObject({ code: "22023", message: "lote_invalido" })
      }
    })
  })

  it("refuses an unknown motive, pilar_retirado included", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      for (const motivo of ["nada", "pilar_retirado"]) {
        const error = await fallaCon(c, "select public.descartar_ideas($1::uuid[], $2)", [[id], motivo])
        expect(error).toMatchObject({ code: "22023", message: "motivo_invalido" })
      }
    })
  })

  it("lets the maintainer discard and refuses anyone else and the service role", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = [await crearIdea(c), await crearIdea(c)]
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.descartar_ideas($1::uuid[], 'debil')", [[a]])).code).toBe("42501")
      await asumir(c, comoServicio)
      expect((await fallaCon(c, "select public.descartar_ideas($1::uuid[], 'debil')", [[a]])).code).toBe("42501")
      await asumir(c, comoMantenedor)
      await c.query("select public.descartar_ideas($1::uuid[], 'otro')", [[b]])
      await asumir(c, comoPostgres)
      expect((await idea(c, b)).descartada_por).toBe(MANTENEDOR)
    })
  })
})

describe("descartar_idea after the batch migration", () => {
  it("stamps who and when too, so a single discard reads like a batch of one", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      await c.query("select public.descartar_idea($1, 'debil')", [id])
      await asumir(c, comoPostgres)
      expect(await idea(c, id)).toMatchObject({ estado: "descartada", motivo_descarte: "debil", descartada_por: CONI })
    })
  })
})

describe("restaurar_ideas", () => {
  it("brings back what Coni discarded inside the window and clears the motive, the time and the author", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = [await crearIdea(c), await crearIdea(c)]
      await asumir(c, comoConi)
      await c.query("select public.descartar_ideas($1::uuid[], 'debil')", [[a, b]])
      const { rows } = await c.query<{ vueltas: string[] }>("select public.restaurar_ideas($1::uuid[]) as vueltas", [
        [a, b],
      ])
      expect([...(rows[0]?.vueltas ?? [])].sort()).toEqual([a, b].sort())
      await asumir(c, comoPostgres)
      expect(await idea(c, a)).toMatchObject({
        estado: "idea",
        motivo_descarte: null,
        descartada_en: null,
        descartada_por: null,
      })
    })
  })

  it("leaves out an idea discarded more than 8 seconds ago by the database clock", async () => {
    await como(comoPostgres, async (c) => {
      const [reciente, vieja] = [await crearIdea(c), await crearIdea(c)]
      await asumir(c, comoConi)
      await c.query("select public.descartar_ideas($1::uuid[], 'debil')", [[reciente, vieja]])
      await asumir(c, comoPostgres)
      await c.query("update public.ideas set descartada_en = now() - interval '9 seconds' where id = $1", [vieja])
      await asumir(c, comoConi)
      const { rows } = await c.query("select public.restaurar_ideas($1::uuid[]) as vueltas", [[reciente, vieja]])
      expect(rows[0]?.vueltas).toEqual([reciente])
      await asumir(c, comoPostgres)
      expect((await idea(c, vieja)).estado).toBe("descartada")
    })
  })

  it("never brings back an idea its retired pillar took out of the bank", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await c.query(
        `update public.ideas set estado = 'descartada', motivo_descarte = 'pilar_retirado',
           descartada_en = now(), descartada_por = $2 where id = $1`,
        [id, CONI],
      )
      await asumir(c, comoConi)
      const { rows } = await c.query("select public.restaurar_ideas($1::uuid[]) as vueltas", [[id]])
      expect(rows[0]?.vueltas).toEqual([])
    })
  })

  it("leaves out an idea whose pillar was retired inside the window", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      await c.query("select public.descartar_ideas($1::uuid[], 'debil')", [[id]])
      await asumir(c, comoPostgres)
      await c.query("update public.categorias set activa = false where slug = 'ia-salud-mental'")
      await asumir(c, comoConi)
      const { rows } = await c.query("select public.restaurar_ideas($1::uuid[]) as vueltas", [[id]])
      expect(rows[0]?.vueltas).toEqual([])
    })
  })

  it("leaves out what the maintainer discarded and lets only Coni call it", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoMantenedor)
      await c.query("select public.descartar_ideas($1::uuid[], 'debil')", [[id]])
      expect((await fallaCon(c, "select public.restaurar_ideas($1::uuid[])", [[id]])).code).toBe("42501")
      await asumir(c, comoConi)
      const { rows } = await c.query("select public.restaurar_ideas($1::uuid[]) as vueltas", [[id]])
      expect(rows[0]?.vueltas).toEqual([])
    })
  })

  it("measures the same window as the app's undo", () => {
    expect(MIGRACION).toContain(`interval '${VENTANA_DESHACER_MS / 1000} seconds'`)
  })
})

const EN_UN_MES = () => new Date(Date.now() + 30 * 86_400_000).toISOString()
const EN_DOS_MESES = () => new Date(Date.now() + 60 * 86_400_000).toISOString()

async function propuestaDe(c: Cliente, piezaId: string) {
  const { rows } = await c.query<{ publicar_en: Date }>(
    "select publicar_en from public.fechas_propuestas where pieza_id = $1",
    [piezaId],
  )
  return rows[0]?.publicar_en.toISOString() ?? null
}

describe("proponer_fechas", () => {
  it("stores one proposal per piece not past gate 2 and replaces it on a second proposal", async () => {
    await como(comoPostgres, async (c) => {
      const [guion, video] = [await crearPiezaEn(c, "guion_por_aprobar"), await crearPiezaEn(c, "video_por_aprobar")]
      const [primera, segunda] = [EN_UN_MES(), EN_DOS_MESES()]
      const tercera = new Date(Date.now() + 90 * 86_400_000).toISOString()
      await asumir(c, comoConi)
      await c.query("select public.proponer_fechas($1::uuid[], $2::timestamptz[])", [
        [guion, video],
        [primera, segunda],
      ])
      await c.query("select public.proponer_fechas($1::uuid[], $2::timestamptz[])", [[video], [tercera]])
      expect(await propuestaDe(c, guion)).toBe(new Date(primera).toISOString())
      expect(await propuestaDe(c, video)).toBe(new Date(tercera).toISOString())
    })
  })

  it("never moves the piece: no version bump and no event of the piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_en_proceso")
      const antes = await c.query("select version from public.piezas where id = $1", [id])
      const eventosAntes = await c.query(
        "select count(*)::int as n from public.eventos where pieza_id = $1 and tabla = 'piezas'",
        [id],
      )
      await asumir(c, comoConi)
      await c.query("select public.proponer_fechas($1::uuid[], $2::timestamptz[])", [[id], [EN_UN_MES()]])
      await asumir(c, comoPostgres)
      expect((await c.query("select version from public.piezas where id = $1", [id])).rows[0]).toEqual(antes.rows[0])
      const eventosDespues = await c.query(
        "select count(*)::int as n from public.eventos where pieza_id = $1 and tabla = 'piezas'",
        [id],
      )
      expect(eventosDespues.rows[0]).toEqual(eventosAntes.rows[0])
      const propios = await c.query(
        "select operacion, actor_rol from public.eventos where pieza_id = $1 and tabla = 'fechas_propuestas'",
        [id],
      )
      expect(propios.rows).toEqual([{ operacion: "insert", actor_rol: "authenticated" }])
    })
  })

  it("refuses a scheduled piece, a date in the past and mismatched lists", async () => {
    await como(comoPostgres, async (c) => {
      const [programada, guion] = [await crearPiezaEn(c, "programado"), await crearPiezaEn(c, "guion_por_aprobar")]
      await asumir(c, comoConi)
      const sql = "select public.proponer_fechas($1::uuid[], $2::timestamptz[])"
      expect(await fallaCon(c, sql, [[programada], [EN_UN_MES()]])).toMatchObject({
        code: "22023",
        message: "propuesta_invalida",
      })
      expect(await fallaCon(c, sql, [[guion], [new Date(Date.now() - 60_000).toISOString()]])).toMatchObject({
        message: "propuesta_invalida",
      })
      expect(await fallaCon(c, sql, [[guion], [EN_UN_MES(), EN_DOS_MESES()]])).toMatchObject({
        message: "lote_invalido",
      })
      expect(
        await fallaCon(c, sql, [
          [guion, guion],
          [EN_UN_MES(), EN_UN_MES()],
        ]),
      ).toMatchObject({
        message: "lote_invalido",
      })
    })
  })

  it("is Coni's only, and nobody writes the table directly", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const sql = "select public.proponer_fechas($1::uuid[], $2::timestamptz[])"
      for (const sesion of [comoMantenedor, comoOtra, comoServicio]) {
        await asumir(c, sesion)
        expect((await fallaCon(c, sql, [[id], [EN_UN_MES()]])).code).toBe("42501")
      }
      await asumir(c, comoConi)
      const directa = await fallaCon(
        c,
        "insert into public.fechas_propuestas (pieza_id, publicar_en) values ($1, $2)",
        [id, EN_UN_MES()],
      )
      expect(directa.code).toBe("42501")
    })
  })

  it("lets Coni and the maintainer read the proposals, and nobody else", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      await c.query("select public.proponer_fechas($1::uuid[], $2::timestamptz[])", [[id], [EN_UN_MES()]])
      await asumir(c, comoMantenedor)
      expect(await propuestaDe(c, id)).not.toBeNull()
      await asumir(c, comoOtra)
      expect(await propuestaDe(c, id)).toBeNull()
    })
  })
})

describe("proponer_fechas and the slots already held (A8)", () => {
  const sql = "select public.proponer_fechas($1::uuid[], $2::timestamptz[])"

  it("refuses a time less than 2 hours ahead", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      const enUnaHora = new Date(Date.now() + 3_600_000).toISOString()
      expect(await fallaCon(c, sql, [[id], [enUnaHora]])).toMatchObject({
        code: "22023",
        message: "propuesta_invalida",
      })
    })
  })

  it("refuses the time a scheduled piece has", async () => {
    await como(comoPostgres, async (c) => {
      const programada = await crearPiezaEn(c, "programado")
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { rows } = await c.query<{ en: Date }>(
        "select puerta2_publicar_en as en from public.piezas where id = $1",
        [programada],
      )
      const tomada = rows[0]?.en.toISOString()
      await asumir(c, comoConi)
      expect(await fallaCon(c, sql, [[id], [tomada]])).toMatchObject({ message: "propuesta_invalida" })
    })
  })

  it("refuses the time of a piece waiting to be uploaded by hand, as a scheduled one", async () => {
    const aMano = await sembrarPieza("para_subir_a_mano")
    const id = await sembrarPieza("guion_por_aprobar")
    const hora = EN_UN_MES()
    try {
      await moverHoraAprobada(aMano, hora)
      await como(comoConi, async (c) => {
        expect(await fallaCon(c, sql, [[id], [hora]])).toMatchObject({ message: "propuesta_invalida" })
      })
    } finally {
      const { rows } = await pool.query<{ idea_id: string | null }>(
        "select idea_id from public.piezas where id = any($1)",
        [[aMano, id]],
      )
      await borrarSembrado(
        [aMano, id],
        rows.flatMap((fila) => (fila.idea_id ? [fila.idea_id] : [])),
      )
    }
  })

  it("refuses the time another piece's live proposal holds, and two pieces of one batch on one time", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = [await crearPiezaEn(c, "guion_por_aprobar"), await crearPiezaEn(c, "video_por_aprobar")]
      const hora = EN_UN_MES()
      await asumir(c, comoConi)
      await c.query(sql, [[a], [hora]])
      expect(await fallaCon(c, sql, [[b], [hora]])).toMatchObject({ message: "propuesta_invalida" })
      expect(
        await fallaCon(c, sql, [
          [a, b],
          [EN_DOS_MESES(), EN_DOS_MESES()],
        ]),
      ).toMatchObject({
        message: "propuesta_invalida",
      })
    })
  })

  it("lets a piece keep its own time or give it up in the same batch, and ignores a proposal no longer live", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = [await crearPiezaEn(c, "guion_por_aprobar"), await crearPiezaEn(c, "video_por_aprobar")]
      const programada = await crearPiezaEn(c, "programado")
      const [hora, otra] = [EN_UN_MES(), EN_DOS_MESES()]
      await asumir(c, comoConi)
      await c.query(sql, [[a], [hora]])
      await c.query(sql, [[a], [hora]])
      await c.query(sql, [
        [a, b],
        [otra, hora],
      ])
      // A proposal left on a piece past gate 2 holds nothing.
      await asumir(c, comoPostgres)
      await c.query("insert into public.fechas_propuestas (pieza_id, publicar_en) values ($1, $2)", [programada, hora])
      await c.query("delete from public.fechas_propuestas where pieza_id = $1", [b])
      await asumir(c, comoConi)
      await c.query(sql, [[b], [hora]])
      expect(await propuestaDe(c, b)).toBe(new Date(hora).toISOString())
    })
  })

  it("takes one lock, so two sessions never store the same time for two pieces", async () => {
    const [a, b] = [await sembrarPieza("guion_por_aprobar"), await sembrarPieza("guion_por_aprobar")]
    const hora = EN_UN_MES()
    const primera = await pool.connect()
    const segunda = await pool.connect()
    try {
      await primera.query("begin")
      await asumir(primera, comoConi)
      await primera.query(sql, [[a], [hora]])
      await segunda.query("begin")
      await asumir(segunda, comoConi)
      const espera = segunda.query(sql, [[b], [hora]]).then(
        () => "guardó",
        (error: { message: string }) => error.message,
      )
      const antes = await Promise.race([espera, new Promise((r) => setTimeout(() => r("esperando"), 300))])
      expect(antes).toBe("esperando")
      await primera.query("commit")
      expect(await espera).toBe("propuesta_invalida")
    } finally {
      await primera.query("rollback")
      await segunda.query("rollback")
      primera.release()
      segunda.release()
      const { rows } = await pool.query<{ idea_id: string | null }>(
        "select idea_id from public.piezas where id = any($1)",
        [[a, b]],
      )
      await borrarSembrado(
        [a, b],
        rows.flatMap((fila) => (fila.idea_id ? [fila.idea_id] : [])),
      )
    }
  })
})

describe("proponer_fechas against gate 2", () => {
  it("holds the pieces it checked until it commits, so gate 2 cannot sign one in between", async () => {
    const id = await sembrarPieza("video_por_aprobar")
    const propone = await pool.connect()
    const firma = await pool.connect()
    try {
      await propone.query("begin")
      await asumir(propone, comoConi)
      await propone.query("select public.proponer_fechas($1::uuid[], $2::timestamptz[])", [[id], [EN_UN_MES()]])
      await firma.query("begin")
      // An update of the piece (gate 2 signing) takes this lock; it must wait for the proposal to commit.
      const error = await fallaCon(firma, "select id from public.piezas where id = $1 for no key update nowait", [id])
      expect(error.code).toBe("55P03")
    } finally {
      await propone.query("rollback")
      await firma.query("rollback")
      propone.release()
      firma.release()
      const { rows } = await pool.query<{ idea_id: string | null }>("select idea_id from public.piezas where id = $1", [
        id,
      ])
      await borrarSembrado(
        [id],
        rows.flatMap((fila) => (fila.idea_id ? [fila.idea_id] : [])),
      )
    }
  })
})

describe("fechas_propuestas grants", () => {
  it("lets no session write the table directly, Coni's and the service role's included", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoPostgres)
      await c.query("insert into public.fechas_propuestas (pieza_id, publicar_en) values ($1, $2)", [id, EN_UN_MES()])
      for (const sesion of [comoConi, comoServicio]) {
        await asumir(c, sesion)
        for (const sql of [
          "insert into public.fechas_propuestas (pieza_id, publicar_en) values ($1, now() + interval '1 day')",
          "update public.fechas_propuestas set publicar_en = now() + interval '2 days' where pieza_id = $1",
          "delete from public.fechas_propuestas where pieza_id = $1",
        ]) {
          expect((await fallaCon(c, sql, [id])).code).toBe("42501")
        }
      }
    })
  })

  it("keeps the service role out of the proposals: only Coni's session and the maintainer read them", async () => {
    await como(comoServicio, async (c) => {
      expect((await fallaCon(c, "select pieza_id from public.fechas_propuestas")).code).toBe("42501")
    })
  })

  it("still lets a piece be deleted with its proposal", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoPostgres)
      await c.query("insert into public.fechas_propuestas (pieza_id, publicar_en) values ($1, $2)", [id, EN_UN_MES()])
      await c.query("delete from public.piezas where id = $1", [id])
      expect(await propuestaDe(c, id)).toBeNull()
    })
  })
})
