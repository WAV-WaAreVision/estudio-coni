import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { hashTextoDePuerta2 } from "@/lib/dominio/puertas"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { aplicar, crearPiezaEn, leer, type OpcionesDePieza, TEXTO, VIDEO } from "./flujo"

afterAll(() => pool.end())

const AMBOS: OpcionesDePieza = { destinos: ["instagram", "linkedin"], textoLinkedin: "Para colegas." }
const SOLO_LINKEDIN: OpcionesDePieza = { destinos: ["linkedin"], textoLinkedin: "Para colegas." }
const ENLACE_LINKEDIN = "https://www.linkedin.com/posts/coni_abc-123"
const ENLACE_INSTAGRAM = "https://www.instagram.com/reel/abc123/"

const EDITAR_LINKEDIN = "select * from public.editar_texto_linkedin_como_coni($1, $2, $3, $4::jsonb)"
const MARCAR = "select * from public.marcar_subido_como_coni($1, $2, $3, $4)"

async function publicacionesDe(c: pg.PoolClient, id: string) {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ destino: string; estado: string; enlace: string | null }>(
    "select destino, estado, enlace from public.publicaciones where pieza_id = $1 order by destino",
    [id],
  )
  return rows
}

describe("editar_texto_linkedin_como_coni", () => {
  it("saves the text and the review without changing the state in video_por_aprobar, and leaves Coni in the log", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar", AMBOS)
      const antes = await leer(c, id)
      await asumir(c, comoConi)
      const revision = JSON.stringify([
        { regla: "hashtags_linkedin", tipo: "advierte", mensaje: "m", campo: "linkedin" },
      ])

      const { rows } = await c.query(EDITAR_LINKEDIN, [id, antes.version, "Nuevo texto", revision])

      expect(rows[0]).toMatchObject({
        estado: "video_por_aprobar",
        texto_linkedin: "Nuevo texto",
        version: antes.version + 1,
        texto: antes.texto,
      })
      expect(rows[0].revision).toEqual(JSON.parse(revision))
      await asumir(c, comoPostgres)
      const { rows: eventos } = await c.query(
        "select actor_usuario, actor_rol from public.eventos where pieza_id = $1 and tabla = 'piezas' order by id desc limit 1",
        [id],
      )
      expect(eventos[0]).toEqual({ actor_usuario: CONI, actor_rol: "authenticated" })
    })
  })

  it.each(["guion_por_aprobar", "guion_aprobado"] as const)(
    "saves it in %s without taking gate 1 back: it is not part of gate 1",
    async (estado) => {
      await como(comoPostgres, async (c) => {
        const id = await crearPiezaEn(c, estado, AMBOS)
        const antes = await leer(c, id)
        await asumir(c, comoConi)

        const { rows } = await c.query(EDITAR_LINKEDIN, [id, antes.version, "Nuevo texto", "[]"])

        expect(rows[0]).toMatchObject({ estado, texto_linkedin: "Nuevo texto", puerta1_hash: antes.puerta1_hash })
      })
    },
  )

  it("takes gate 2 back and clears the rows when the piece was programado: back to video_por_aprobar", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", AMBOS)
      const antes = await leer(c, id)
      expect(await publicacionesDe(c, id)).toHaveLength(2)
      await asumir(c, comoConi)

      const { rows } = await c.query(EDITAR_LINKEDIN, [id, antes.version, "Nuevo texto", "[]"])

      expect(rows[0]).toMatchObject({
        estado: "video_por_aprobar",
        texto_linkedin: "Nuevo texto",
        puerta2_hash_texto: null,
        puerta2_video_id: null,
        puerta2_publicar_en: null,
        puerta2_formula: null,
        intento: antes.intento + 1,
      })
      expect(await publicacionesDe(c, id)).toEqual([])
    })
  })

  it("refuses the service role and the maintainer", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar", AMBOS)
      const { version } = await leer(c, id)
      for (const sesion of [comoServicio, comoMantenedor]) {
        await asumir(c, sesion)
        const error = await fallaCon(c, EDITAR_LINKEDIN, [id, version, "x", "[]"])
        expect(error.message).toBe("solo_coni_edita_texto")
      }
    })
  })

  it("refuses a stale version with the 409 code", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar", AMBOS)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(c, EDITAR_LINKEDIN, [id, version - 1, "x", "[]"])
      expect(error.code).toBe("PT409")
      expect(error.message).toBe("version_desfasada")
    })
  })

  it.each(["en_render", "para_subir_a_mano", "publicado_a_mano"] as const)(
    "refuses to edit it in %s",
    async (estado) => {
      await como(comoPostgres, async (c) => {
        const id = await crearPiezaEn(c, estado, AMBOS)
        const { version } = await leer(c, id)
        await asumir(c, comoConi)
        const error = await fallaCon(c, EDITAR_LINKEDIN, [id, version, "x", "[]"])
        expect(error.message).toBe("estado_no_editable")
      })
    },
  )

  it("refuses an empty text, a text over 3000 characters and a review that is not a list", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar", AMBOS)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      expect((await fallaCon(c, EDITAR_LINKEDIN, [id, version, "  \n ", "[]"])).message).toBe("texto_vacio")
      expect((await fallaCon(c, EDITAR_LINKEDIN, [id, version, "a".repeat(3001), "[]"])).message).toMatch(
        /texto_linkedin_largo/,
      )
      expect((await fallaCon(c, EDITAR_LINKEDIN, [id, version, "x", "{}"])).message).toBe("revision_invalida")
    })
  })
})

describe("marcar_subido_como_coni", () => {
  it("marks only the destination she says when another is pending: the piece keeps its state", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", AMBOS)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)

      const { rows } = await c.query(MARCAR, [id, version, "linkedin", ENLACE_LINKEDIN])

      expect(rows[0]).toMatchObject({ estado: "para_subir_a_mano", version: version + 1, permalink: null })
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "para_subir", enlace: null },
        { destino: "linkedin", estado: "subido_a_mano", enlace: ENLACE_LINKEDIN },
      ])
    })
  })

  it("makes the piece publicado_a_mano with the last mark and keeps the Instagram link in permalink", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", AMBOS)
      await asumir(c, comoConi)
      const primera = await leer(c, id)
      await c.query(MARCAR, [id, primera.version, "linkedin", ""])
      const segunda = await leer(c, id)

      const { rows } = await c.query(MARCAR, [id, segunda.version, "instagram", ENLACE_INSTAGRAM])

      expect(rows[0]).toMatchObject({ estado: "publicado_a_mano", permalink: ENLACE_INSTAGRAM })
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "subido_a_mano", enlace: ENLACE_INSTAGRAM },
        { destino: "linkedin", estado: "subido_a_mano", enlace: null },
      ])
    })
  })

  it("makes a piece with one destination publicado_a_mano at once", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", SOLO_LINKEDIN)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)

      const { rows } = await c.query(MARCAR, [id, version, "linkedin", null])

      expect(rows[0]).toMatchObject({ estado: "publicado_a_mano", permalink: null })
    })
  })

  it("lets her mark one destination before the time when the piece is still programado", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", AMBOS)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)

      const { rows } = await c.query(MARCAR, [id, version, "linkedin", null])

      expect(rows[0]).toMatchObject({ estado: "programado" })
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "esperando", enlace: null },
        { destino: "linkedin", estado: "subido_a_mano", enlace: null },
      ])
    })
  })

  it("leaves Coni in the audit log of the piece and of the row", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", AMBOS)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      await c.query(MARCAR, [id, version, "linkedin", null])
      await asumir(c, comoPostgres)
      const { rows } = await c.query(
        `select tabla, actor_usuario, actor_rol from public.eventos
         where pieza_id = $1 and tabla in ('publicaciones', 'piezas') order by id desc limit 2`,
        [id],
      )
      expect(rows.map((r) => [r.actor_usuario, r.actor_rol])).toEqual([
        [CONI, "authenticated"],
        [CONI, "authenticated"],
      ])
      const { rows: filas } = await c.query(
        "select marcado_por, marcado_en is not null as con_hora from public.publicaciones where pieza_id = $1 and destino = 'linkedin'",
        [id],
      )
      expect(filas[0]).toEqual({ marcado_por: CONI, con_hora: true })
    })
  })

  it("refuses the service role and the maintainer", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", AMBOS)
      const { version } = await leer(c, id)
      for (const sesion of [comoServicio, comoMantenedor]) {
        await asumir(c, sesion)
        const error = await fallaCon(c, MARCAR, [id, version, "linkedin", null])
        expect(error.message).toBe("solo_coni_marca_subido")
      }
    })
  })

  it("refuses a destination that is not pending: one she already marked, one the piece does not have", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", AMBOS)
      await asumir(c, comoConi)
      const { version } = await leer(c, id)
      await c.query(MARCAR, [id, version, "linkedin", null])
      const otra = await leer(c, id)
      expect((await fallaCon(c, MARCAR, [id, otra.version, "linkedin", null])).message).toBe("destino_no_pendiente")

      const soloInstagram = await crearPiezaEn(c, "para_subir_a_mano")
      await asumir(c, comoConi)
      const { version: v } = await leer(c, soloInstagram)
      expect((await fallaCon(c, MARCAR, [soloInstagram, v, "linkedin", null])).message).toBe("destino_no_pendiente")
    })
  })

  it("refuses a stale version with the 409 code and a state that is not waiting for the upload", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", AMBOS)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const vieja = await fallaCon(c, MARCAR, [id, version - 1, "linkedin", null])
      expect(vieja.code).toBe("PT409")
      expect(vieja.message).toBe("version_desfasada")

      const enAprobacion = await crearPiezaEn(c, "video_por_aprobar", AMBOS)
      await asumir(c, comoConi)
      const { version: v } = await leer(c, enAprobacion)
      expect((await fallaCon(c, MARCAR, [enAprobacion, v, "linkedin", null])).message).toBe("estado_no_marcable")
    })
  })

  it("refuses an unknown destination", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", AMBOS)
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      expect((await fallaCon(c, MARCAR, [id, version, "tiktok", null])).message).toBe("destino_no_pendiente")
    })
  })
})

describe("publicaciones: las filas siguen a la pieza", () => {
  it("creates one esperando row per chosen destination when gate 2 is approved", async () => {
    await como(comoPostgres, async (c) => {
      const ambos = await crearPiezaEn(c, "programado", AMBOS)
      expect(await publicacionesDe(c, ambos)).toEqual([
        { destino: "instagram", estado: "esperando", enlace: null },
        { destino: "linkedin", estado: "esperando", enlace: null },
      ])
      const linkedin = await crearPiezaEn(c, "programado", SOLO_LINKEDIN)
      expect(await publicacionesDe(c, linkedin)).toEqual([{ destino: "linkedin", estado: "esperando", enlace: null }])
    })
  })

  it("treats an approval from before LinkedIn as Instagram only", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      expect((await leer(c, id)).destinos).toEqual(["instagram"])
      expect(await publicacionesDe(c, id)).toEqual([{ destino: "instagram", estado: "esperando", enlace: null }])
    })
  })

  it.each([
    ["cambiar_fecha", { tipo: "cambiar_fecha" }],
    ["hora_vencida", { tipo: "hora_vencida" }],
    ["descartar", { tipo: "descartar" }],
  ] as const)("deletes the rows when gate 2 is taken back by %s", async (_nombre, evento) => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", AMBOS)
      expect(await publicacionesDe(c, id)).toHaveLength(2)
      await aplicar(c, id, comoConi, evento)
      expect(await publicacionesDe(c, id)).toEqual([])
    })
  })

  it("keeps a destination she already uploaded when gate 2 is taken back, and deletes only what still waited", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", AMBOS)
      await asumir(c, comoConi)
      const { version } = await leer(c, id)
      await c.query(MARCAR, [id, version, "linkedin", ENLACE_LINKEDIN])
      await aplicar(c, id, comoConi, { tipo: "cambiar_fecha" })
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "linkedin", estado: "subido_a_mano", enlace: ENLACE_LINKEDIN },
      ])
    })
  })

  it("does not overwrite a finished destination when gate 2 is approved again, and creates the others", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", AMBOS)
      await asumir(c, comoConi)
      const { version } = await leer(c, id)
      await c.query(MARCAR, [id, version, "linkedin", ENLACE_LINKEDIN])
      await aplicar(c, id, comoConi, { tipo: "cambiar_fecha" })
      const hash = hashTextoDePuerta2(2, {
        texto: TEXTO,
        textoLinkedin: "Para colegas.",
        destinos: ["instagram", "linkedin"],
      })
      await aplicar(
        c,
        id,
        comoConi,
        {
          tipo: "aprobar_video",
          actor: "coni",
          videoVisto: VIDEO,
          hashTextoVisto: hash,
          hashTextoActual: hash,
          formula: 2,
          publicarEn: new Date(Date.now() + 864e5).toISOString(),
          en: new Date().toISOString(),
        },
        { destinos: ["instagram", "linkedin"] },
      )
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "esperando", enlace: null },
        { destino: "linkedin", estado: "subido_a_mano", enlace: ENLACE_LINKEDIN },
      ])
      await aplicar(c, id, comoServicio, { tipo: "entregar_para_subir" })
      expect((await publicacionesDe(c, id)).map((p) => p.estado)).toEqual(["para_subir", "subido_a_mano"])
    })
  })

  it("moves every esperando row to para_subir when the time comes and the piece is handed over", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano", AMBOS)
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "para_subir", enlace: null },
        { destino: "linkedin", estado: "para_subir", enlace: null },
      ])
    })
  })

  it("creates the rows of a piece handed over without them, so the screen always has something to show", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", AMBOS)
      await asumir(c, comoPostgres)
      await c.query("delete from public.publicaciones where pieza_id = $1", [id])
      await aplicar(c, id, comoServicio, { tipo: "entregar_para_subir" })
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "para_subir", enlace: null },
        { destino: "linkedin", estado: "para_subir", enlace: null },
      ])
    })
  })

  it("marks the Instagram row publicado when Instagram published it by itself", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      await aplicar(c, id, comoServicio, { tipo: "publicado" }, { permalink: ENLACE_INSTAGRAM, media_id: "m1" })
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "publicado", enlace: ENLACE_INSTAGRAM },
      ])
    })
  })

  it("handles the mixed case: Instagram published by the API, LinkedIn waits for her by hand", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", AMBOS)
      const fila = await aplicar(
        c,
        id,
        comoServicio,
        { tipo: "publicado", quedanAMano: true },
        { permalink: ENLACE_INSTAGRAM, media_id: "m1" },
      )
      expect(fila.estado).toBe("para_subir_a_mano")
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "publicado", enlace: ENLACE_INSTAGRAM },
        { destino: "linkedin", estado: "para_subir", enlace: null },
      ])
      await asumir(c, comoConi)
      const { rows } = await c.query(MARCAR, [id, fila.version, "linkedin", null])
      expect(rows[0]).toMatchObject({ estado: "publicado_a_mano" })
    })
  })

  it("marks what was pending as uploaded by hand when the piece becomes publicado_a_mano by any path", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "publicado_a_mano", AMBOS)
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "subido_a_mano", enlace: null },
        { destino: "linkedin", estado: "subido_a_mano", enlace: null },
      ])
    })
  })

  it("keeps the rows through an error in the publication and a retry", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", AMBOS)
      await aplicar(c, id, comoServicio, { tipo: "falla_publicacion", explicacion: "x" })
      expect(await publicacionesDe(c, id)).toHaveLength(2)
      await aplicar(c, id, comoConi, { tipo: "reintentar", ahora: new Date().toISOString() })
      expect(await publicacionesDe(c, id)).toEqual([
        { destino: "instagram", estado: "esperando", enlace: null },
        { destino: "linkedin", estado: "esperando", enlace: null },
      ])
    })
  })

  it("lets Coni read the rows but not write them", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado", SOLO_LINKEDIN)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "update public.publicaciones set estado = 'subido_a_mano' where pieza_id = $1", [
        id,
      ])
      expect(error.message).toMatch(/permission denied/)
    })
  })
})
