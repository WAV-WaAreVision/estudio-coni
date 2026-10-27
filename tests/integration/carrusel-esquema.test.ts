import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { ESTADOS } from "@/lib/dominio/estados"
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
import { crearPiezaEn } from "./flujo"

afterAll(() => pool.end())

describe("estado_pieza", () => {
  it("mirrors ESTADOS, the two carousel states included", async () => {
    const { rows } = await pool.query<{ valor: string }>(
      "select unnest(enum_range(null::public.estado_pieza))::text as valor",
    )
    expect(new Set(rows.map((fila) => fila.valor))).toEqual(new Set(ESTADOS))
    expect(ESTADOS).toContain("armando_carrusel")
    expect(ESTADOS).toContain("carrusel_por_aprobar")
  })
})

type Cliente = pg.PoolClient
const HASH = "c".repeat(64)
const LAMINAS = JSON.stringify([
  { tipo: "portada", texto: "Portada" },
  { tipo: "idea", texto: "Uno" },
  { tipo: "idea", texto: "Dos" },
  { tipo: "idea", texto: "Tres" },
  { tipo: "idea", texto: "Cuatro" },
  { tipo: "cierre", texto: "¿Pregunta?" },
])

async function carrusel(c: Cliente, estado = "guion_en_proceso"): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ id: string }>(
    "insert into public.piezas (titulo, tipo, destinos) values ('Carrusel', 'carrusel', '{linkedin}') returning id",
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el carrusel")
  await c.query("update public.piezas set estado = $2, version = version + 1 where id = $1", [id, estado])
  return id
}

async function version(c: Cliente, piezaId: string, extra: { origen?: string; pedido?: string | null } = {}) {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, pedido)
     values ($1, coalesce((select max(version) from public.carruseles where pieza_id = $1), 0) + 1, $2::jsonb, 'Texto', $3, $4, $5)
     returning id`,
    [piezaId, LAMINAS, HASH, extra.origen ?? "inicial", extra.pedido ?? null],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la versión")
  return id
}

describe("piezas.tipo", () => {
  it("is reel for a piece created as today, and accepts only reel or carrusel", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ tipo: string; destinos: string[] }>(
        "insert into public.piezas (titulo) values ('Reel') returning tipo, destinos",
      )
      expect(rows[0]).toEqual({ tipo: "reel", destinos: ["instagram"] })
      // LinkedIn only, so carrusel_solo_linkedin (checked first, by name) lets the bad type reach tipo_valido.
      const error = await fallaCon(
        c,
        "insert into public.piezas (titulo, tipo, destinos) values ('X', 'video', '{linkedin}')",
      )
      expect(error).toMatchObject({ code: "23514", constraint: "tipo_valido" })
    })
  })

  it("keeps a reel out of the carousel states", async () => {
    await como(comoPostgres, async (c) => {
      // A reel signed through the real flow: its gate 1 stands, so only the type check can refuse the move (the
      // owner is not Coni, and carrusel_por_aprobar is not a state only Coni enters).
      const id = await crearPiezaEn(c, "en_render")
      await asumir(c, comoPostgres)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'carrusel_por_aprobar', version = version + 1 where id = $1",
        [id],
      )
      expect(error).toMatchObject({ code: "23514", constraint: "estados_del_tipo" })
    })
  })

  it("keeps a carousel out of every voice, avatar and video state", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      // As Coni: the states only she enters would otherwise stop the owner in proteger_pieza before any check.
      await asumir(c, comoConi)
      for (const estado of ["guion_aprobado", "grabando_voz", "en_render", "subtitulando", "video_por_aprobar"]) {
        const error = await fallaCon(c, "update public.piezas set estado = $2, version = version + 1 where id = $1", [
          id,
          estado,
        ])
        expect(error, estado).toMatchObject({ code: "23514" })
        // Without a signature aprobada_para_grabar fails too; grabando_voz needs none, so there it is the type alone.
        if (estado === "grabando_voz") expect(error.constraint).toBe("estados_del_tipo")
        else expect(["estados_del_tipo", "aprobada_para_grabar"], estado).toContain(error.constraint)
      }
    })
  })

  it("gives a carousel LinkedIn only", async () => {
    await como(comoPostgres, async (c) => {
      for (const destinos of ["{instagram}", "{instagram,linkedin}"]) {
        const error = await fallaCon(
          c,
          "insert into public.piezas (titulo, tipo, destinos) values ('C', 'carrusel', $1::text[])",
          [destinos],
        )
        expect(error, destinos).toMatchObject({ code: "23514", constraint: "carrusel_solo_linkedin" })
      }
    })
  })

  it("never lets a carousel store a voice, a video, a render, an avatar, a script or a caption", async () => {
    await como(comoPostgres, async (c) => {
      // At gate 1 and as Coni, so the avatar rules of proteger_pieza let the write reach the check.
      const id = await carrusel(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      for (const [columna, valor] of [
        ["audio_id", "voces/x.mp3"],
        ["video_id", "videos/x.mp4"],
        ["render_id", "r"],
        ["avatar_id", "look-a"],
        ["guion", "Hola"],
        ["texto", "Texto"],
      ]) {
        const error = await fallaCon(
          c,
          `update public.piezas set ${columna} = $2, version = version + 1 where id = $1`,
          [id, valor],
        )
        expect(error, columna).toMatchObject({ code: "23514", constraint: "carrusel_sin_reel" })
      }
    })
  })

  it("keeps pedido_de_cambio for carousels, and never empty", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ id: string }>("insert into public.piezas (titulo) values ('Reel') returning id")
      const enReel = await fallaCon(
        c,
        "update public.piezas set pedido_de_cambio = 'más corto', version = version + 1 where id = $1",
        [rows[0]?.id],
      )
      expect(enReel).toMatchObject({ code: "23514", constraint: "pedido_solo_de_carrusel" })
      const id = await carrusel(c)
      const vacio = await fallaCon(
        c,
        "update public.piezas set pedido_de_cambio = '  ', version = version + 1 where id = $1",
        [id],
      )
      expect(vacio).toMatchObject({ code: "23514", constraint: "pedido_no_vacio" })
    })
  })
})

describe("carruseles", () => {
  it("numbers versions per piece once each", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      await version(c, id)
      const error = await fallaCon(
        c,
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen) values ($1, 1, $2::jsonb, 'T', $3, 'inicial')",
        [id, LAMINAS, HASH],
      )
      expect(error).toMatchObject({ code: "23505" })
    })
  })

  it("belongs to a carousel piece only", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ id: string }>("insert into public.piezas (titulo) values ('Reel') returning id")
      const error = await fallaCon(
        c,
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen) values ($1, 1, $2::jsonb, 'T', $3, 'inicial')",
        [rows[0]?.id, LAMINAS, HASH],
      )
      expect(error).toMatchObject({ code: "42501", message: "pieza_no_es_carrusel" })
    })
  })

  it("ties the sentence to a text change and refuses fewer than six slides or a bad hash", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      const sinPedido = await fallaCon(
        c,
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen) values ($1, 1, $2::jsonb, 'T', $3, 'cambio_texto')",
        [id, LAMINAS, HASH],
      )
      expect(sinPedido).toMatchObject({ code: "23514", constraint: "pedido_del_cambio" })
      const conPedido = await fallaCon(
        c,
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, pedido) values ($1, 1, $2::jsonb, 'T', $3, 'inicial', 'x')",
        [id, LAMINAS, HASH],
      )
      expect(conPedido).toMatchObject({ code: "23514", constraint: "pedido_del_cambio" })
      const corto = await fallaCon(
        c,
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen) values ($1, 1, '[]'::jsonb, 'T', $2, 'inicial')",
        [id, HASH],
      )
      expect(corto).toMatchObject({ code: "23514" })
      const hash = await fallaCon(
        c,
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen) values ($1, 1, $2::jsonb, 'T', 'abc', 'inicial')",
        [id, LAMINAS],
      )
      expect(hash).toMatchObject({ code: "23514" })
    })
  })

  it("takes at most eight slides: a cover, six ideas and a closing one", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      const laminas = (ideas: number) =>
        JSON.stringify([
          { tipo: "portada", texto: "Portada" },
          ...Array.from({ length: ideas }, (_, i) => ({ tipo: "idea", texto: `Idea ${i + 1}` })),
          { tipo: "cierre", texto: "¿Pregunta?" },
        ])
      const insertar =
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen) values ($1, $2, $3::jsonb, 'T', $4, 'inicial')"
      const largo = await fallaCon(c, insertar, [id, 1, laminas(7), HASH])
      expect(largo).toMatchObject({ code: "23514", constraint: "carrusel_hasta_ocho_laminas" })
      await c.query(insertar, [id, 1, laminas(6), HASH])
    })
  })

  it("never changes the words of a version, but lets its rendering state move", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      const v = await version(c, id)
      for (const cambio of [
        "texto_post = 'Otro'",
        "laminas = '[]'::jsonb",
        `hash_texto = '${"d".repeat(64)}'`,
        "origen = 'acortado'",
      ]) {
        const error = await fallaCon(c, `update public.carruseles set ${cambio} where id = $1`, [v])
        expect(error, cambio).toMatchObject({ code: "42501", message: "carrusel_inmutable" })
      }
      await asumir(c, comoServicio)
      await c.query("update public.carruseles set estado = 'armando', pdf_clave = 'carruseles/x.pdf' where id = $1", [
        v,
      ])
    })
  })

  it("is read by Coni and the maintainer only, and written by nobody's session", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      await version(c, id)
      for (const sesion of [comoConi, comoMantenedor]) {
        await asumir(c, sesion)
        const { rows } = await c.query("select id from public.carruseles where pieza_id = $1", [id])
        expect(rows).toHaveLength(1)
      }
      await asumir(c, comoOtra)
      expect((await c.query("select id from public.carruseles where pieza_id = $1", [id])).rows).toHaveLength(0)
      await asumir(c, comoConi)
      const inserta = await fallaCon(
        c,
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen) values ($1, 9, $2::jsonb, 'T', $3, 'inicial')",
        [id, LAMINAS, HASH],
      )
      expect(inserta).toMatchObject({ code: "42501" })
      const actualiza = await fallaCon(c, "update public.carruseles set estado = 'listo' where pieza_id = $1", [id])
      expect(actualiza).toMatchObject({ code: "42501" })
      const borra = await fallaCon(c, "delete from public.carruseles where pieza_id = $1", [id])
      expect(borra).toMatchObject({ code: "42501" })
    })
  })

  it("writes every change to the audit log under its piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      await version(c, id)
      const { rows } = await c.query(
        "select operacion from public.eventos where tabla = 'carruseles' and pieza_id = $1",
        [id],
      )
      expect(rows).toEqual([{ operacion: "insert" }])
    })
  })
})

describe("gate 2 by type", () => {
  it("needs a video for a reel and a carousel version of the same piece for a carousel", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      const v = await version(c, id)
      const otro = await version(c, await carrusel(c))
      // The table's own constraints, without proteger_pieza: since carousels part 2 (20261027000100) it refuses a
      // gate 2 that is not the latest rendered version first (carrusel-armado-esquema.test.ts covers that binding).
      // As the owner, in this rolled-back transaction, writing puerta2_por as the trigger would.
      await c.query("alter table public.piezas disable trigger proteger_pieza")
      const conVideo = await fallaCon(
        c,
        `update public.piezas set version = version + 1, puerta2_video_id = 'v', puerta2_hash_texto = $2,
           puerta2_publicar_en = now(), puerta2_en = now(), puerta2_por = $3 where id = $1`,
        [id, HASH, CONI],
      )
      expect(conVideo).toMatchObject({ code: "23514", constraint: "puerta2_completa" })
      const ajena = await fallaCon(
        c,
        `update public.piezas set version = version + 1, puerta2_carrusel_id = $2, puerta2_hash_texto = $3,
           puerta2_publicar_en = now(), puerta2_en = now(), puerta2_por = $4 where id = $1`,
        [id, otro, HASH, CONI],
      )
      expect(ajena).toMatchObject({ code: "23503", constraint: "puerta2_carrusel_de_la_pieza" })
      await c.query(
        `update public.piezas set version = version + 1, puerta2_carrusel_id = $2, puerta2_hash_texto = $3,
           puerta2_publicar_en = now(), puerta2_en = now(), puerta2_por = $4 where id = $1`,
        [id, v, HASH, CONI],
      )
    })
  })
})

describe("publicaciones.documento_urn", () => {
  it("takes a LinkedIn document URN, and never together with a video URN", async () => {
    await como(comoPostgres, async (c) => {
      const id = await carrusel(c)
      await c.query(
        "insert into public.publicaciones (pieza_id, destino, estado) values ($1, 'linkedin', 'esperando')",
        [id],
      )
      await c.query(
        "update public.publicaciones set documento_urn = 'urn:li:document:D5610AQH_x-1' where pieza_id = $1",
        [id],
      )
      const mala = await fallaCon(
        c,
        "update public.publicaciones set documento_urn = 'urn:li:video:1' where pieza_id = $1",
        [id],
      )
      expect(mala).toMatchObject({ code: "23514", constraint: "documento_urn_es_de_documento" })
      const ambas = await fallaCon(
        c,
        "update public.publicaciones set video_urn = 'urn:li:video:1' where pieza_id = $1",
        [id],
      )
      expect(ambas).toMatchObject({ code: "23514", constraint: "un_solo_medio" })
    })
  })
})
