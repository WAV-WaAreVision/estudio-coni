import { afterAll, describe, expect, it } from "vitest"
import { CONI, como, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { sembrarIdeaDelMotor, vaciarMotor } from "./siembra"

afterAll(async () => {
  await vaciarMotor()
  await pool.end()
})

describe("materiales.anio", () => {
  it("takes a plausible year and refuses another", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (autor_id, tipo, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ((select id from public.autores where tipo = 'coni'), 'documento', 'anio', now(), $1) returning id`,
        [CONI],
      )
      const id = rows[0]?.id
      await c.query("update public.materiales set anio = 2026 where id = $1", [id])
      expect((await fallaCon(c, "update public.materiales set anio = 1850 where id = $1", [id])).code).toBe("23514")
    })
  })
})

describe("respaldo_de_idea con fuente", () => {
  it("adds per claim the author, the material's title and year", async () => {
    const idea = await sembrarIdeaDelMotor({
      gancho: "Una de cada cuatro personas ya usa IA para su salud mental.",
      semana: "2026-10-12",
      pilar: "ia-salud-mental",
      teoria: {
        titulo: "T",
        tesis: "Te",
        nivel: "alto",
        respaldo: [
          { autor: "Siembra Stanford", cita: "c1", titulo: "AI for Mental Health", anio: 2026 },
          { autor: "Siembra Sin Título", cita: "c2" },
        ],
      },
    })
    const respaldo = await como(comoServicio, async (c) => {
      const { rows } = await c.query<{ r: { afirmaciones: { autor: string; fuente: unknown }[] } }>(
        "select public.respaldo_de_idea($1, 12) as r",
        [idea],
      )
      return rows[0]?.r
    })
    const porAutor = new Map(respaldo?.afirmaciones.map((a) => [a.autor, a.fuente]))
    expect(porAutor.get("Siembra Stanford")).toEqual({
      autor: "Siembra Stanford",
      titulo: "AI for Mental Health",
      anio: 2026,
    })
    expect(porAutor.get("Siembra Sin Título")).toEqual({ autor: "Siembra Sin Título", titulo: null, anio: null })
  })
})
