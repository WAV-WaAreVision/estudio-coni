import { afterAll, describe, expect, it } from "vitest"
import { como, comoPostgres, comoServicio, pool } from "./db"
import { aplicar, crearPiezaEn, TEXTO } from "./flujo"

afterAll(() => pool.end())

interface Aviso {
  tipo: string
  clave: string
  mensaje: string
  pieza_id: string | null
  enviado_en: Date | null
}

async function avisosDe(c: Parameters<Parameters<typeof como>[1]>[0], piezaId: string): Promise<Aviso[]> {
  const { rows } = await c.query<Aviso>(
    "select tipo, clave, mensaje, pieza_id, enviado_en from public.avisos where pieza_id = $1 order by clave",
    [piezaId],
  )
  return rows
}

describe("avisos que crea la base cuando una pieza queda lista para Coni", () => {
  it("notes a script ready for review, waiting for the summary, with the title and not the script", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const avisos = await avisosDe(c, id)
      expect(avisos).toHaveLength(1)
      expect(avisos[0]).toMatchObject({ tipo: "guion_listo", pieza_id: id, enviado_en: null })
      expect(avisos[0]?.mensaje).toContain("Prueba")
      expect(avisos[0]?.mensaje).not.toContain("Hola, soy Coni")
      expect(avisos[0]?.clave).toMatch(new RegExp(`^guion_listo:${id}:\\d+$`))
    })
  })

  it("notes a video ready to watch when the subtitles are done", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar")
      const avisos = await avisosDe(c, id)
      expect(avisos.map((a) => a.tipo).sort()).toEqual(["guion_listo", "video_listo"])
      expect(avisos.find((a) => a.tipo === "video_listo")?.mensaje).toContain("Prueba")
    })
  })

  it("says nothing for the steps that are not hers to look at", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "subtitulando")
      expect((await avisosDe(c, id)).map((a) => a.tipo)).toEqual(["guion_listo"])
    })
  })

  it("does not repeat a notice when the piece is saved again in the same state", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await c.query("update public.piezas set explicacion = 'una nota', version = version + 1 where id = $1", [id])
      expect(await avisosDe(c, id)).toHaveLength(1)
    })
  })

  it("notes the script again when Coni asks for changes and a new one comes back", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await aplicar(c, id, { tipo: "usuario", id: "c0000000-0000-4000-8000-000000000001" }, { tipo: "pedir_cambios" })
      await aplicar(c, id, comoServicio, { tipo: "guion_listo", audioId: "audio-2" }, { guion: TEXTO, texto: TEXTO })
      const avisos = await avisosDe(c, id)
      expect(avisos.map((a) => a.tipo)).toEqual(["guion_listo", "guion_listo"])
      expect(new Set(avisos.map((a) => a.clave)).size).toBe(2)
    })
  })
})
