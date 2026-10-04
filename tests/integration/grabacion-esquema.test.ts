import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { hashPuerta1 } from "@/lib/dominio/puertas"
import { asumir, como, comoConi, comoPostgres, comoServicio, pool } from "./db"
import { AUDIO, aplicar, crearPiezaEn, GUION } from "./flujo"

afterAll(() => pool.end())

// HeyGen's id of the video of the current attempt. A new attempt must never read the id of an old one.
async function renderDe(c: pg.PoolClient, id: string): Promise<string | null> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ render_id: string | null }>("select render_id from public.piezas where id = $1", [
    id,
  ])
  return rows[0]?.render_id ?? null
}

/** The write `grabarPieza` makes right after POST /v3/videos. */
async function guardarRender(c: pg.PoolClient, id: string, renderId: string): Promise<void> {
  await asumir(c, comoServicio)
  const { rowCount } = await c.query(
    "update public.piezas set render_id = $2, version = version + 1 where id = $1 and estado in ('en_render', 'subtitulando')",
    [id, renderId],
  )
  expect(rowCount).toBe(1)
}

const aprobacion = {
  tipo: "aprobar_guion",
  actor: "coni",
  hashVisto: hashPuerta1({ formula: 1, guion: GUION, audioId: AUDIO }),
  hashActual: hashPuerta1({ formula: 1, guion: GUION, audioId: AUDIO }),
  en: new Date().toISOString(),
} as const

describe("render_id al entrar a en_render", () => {
  it("lo conserva mientras la pieza sigue en render o subtitulando", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await guardarRender(c, id, "v_1")
      expect(await renderDe(c, id)).toBe("v_1")

      await aplicar(c, id, comoServicio, { tipo: "render_entregado" })
      expect(await renderDe(c, id)).toBe("v_1")
    })
  })

  it("lo borra cuando Coni pide regrabar el video", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await guardarRender(c, id, "v_1")
      await aplicar(c, id, comoServicio, { tipo: "render_entregado" })
      await aplicar(c, id, comoServicio, { tipo: "video_listo", videoId: "video-1" })
      expect(await renderDe(c, id)).toBe("v_1")

      await aplicar(c, id, comoConi, { tipo: "regrabar" })

      expect(await renderDe(c, id)).toBeNull()
    })
  })

  it("lo conserva tras una política de contenido y lo borra cuando Coni vuelve a aprobar el guion", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await guardarRender(c, id, "v_1")

      await aplicar(c, id, comoServicio, { tipo: "politica_contenido", explicacion: "Frase no permitida" })
      expect(await renderDe(c, id)).toBe("v_1")

      await aplicar(c, id, comoConi, aprobacion)
      await aplicar(c, id, comoConi, { tipo: "grabar_video" })
      expect(await renderDe(c, id)).toBeNull()
    })
  })

  it("lo borra cuando Coni reintenta una falla que ocurrió en el render", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await guardarRender(c, id, "v_1")
      await aplicar(c, id, comoServicio, { tipo: "falla_produccion", explicacion: "HeyGen falló" })
      expect(await renderDe(c, id)).toBe("v_1")

      await aplicar(c, id, comoConi, { tipo: "reintentar", ahora: new Date().toISOString() })

      expect(await renderDe(c, id)).toBeNull()
    })
  })

  it("lo conserva cuando Coni reintenta una falla que ocurrió al poner los subtítulos", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await guardarRender(c, id, "v_1")
      await aplicar(c, id, comoServicio, { tipo: "render_entregado" })
      await aplicar(c, id, comoServicio, { tipo: "falla_produccion", explicacion: "Los chequeos fallaron" })

      const fila = await aplicar(c, id, comoConi, { tipo: "reintentar", ahora: new Date().toISOString() })

      expect(fila.estado).toBe("subtitulando")
      expect(await renderDe(c, id)).toBe("v_1")
    })
  })
})
