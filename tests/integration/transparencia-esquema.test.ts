import type { PoolClient } from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

const LARGO = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const OTRO = `${LARGO}\n\nY una línea más.`
const TABLAS = ["inventario_de_datos", "registro_de_borrados", "revisiones_de_inventario", "transparencia_versiones"]

/** Each test starts with nothing published; `como` rolls everything back afterwards. */
async function sinPublicar(c: PoolClient): Promise<void> {
  await asumir(c, comoPostgres)
  await c.query("delete from public.transparencia_versiones where not propuesta")
}

async function comoAnonimo(c: PoolClient): Promise<void> {
  await asumir(c, comoPostgres)
  await c.query("set local role anon")
}

async function publicar(c: PoolClient, texto: string, motivo: string): Promise<number | undefined> {
  const { rows } = await c.query<{ v: number }>("select public.publicar_transparencia($1, $2) as v", [texto, motivo])
  return rows[0]?.v
}

describe("transparencia_versiones", () => {
  it("starts with WAV's draft as version 0, a proposal that can never be the current page", async () => {
    const { rows } = await pool.query<{ version: number; vigente: boolean; largo: number }>(
      "select version, vigente, char_length(texto) as largo from public.transparencia_versiones where propuesta",
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ version: 0, vigente: false })
    expect(rows[0]?.largo).toBeGreaterThanOrEqual(300)
    expect(rows[0]?.largo).toBeLessThanOrEqual(6000)
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(c, "update public.transparencia_versiones set vigente = true where propuesta")
      expect(error.message).toMatch(/propuesta_nunca_vigente/)
    })
  })

  it("gives the public page nothing before Coni publishes, then only the current text and its date", async () => {
    await como(comoPostgres, async (c) => {
      await sinPublicar(c)
      await comoAnonimo(c)
      expect((await c.query("select * from public.transparencia_vigente()")).rowCount).toBe(0)

      await asumir(c, comoConi)
      await publicar(c, LARGO, "Primera versión")
      await comoAnonimo(c)
      const { rows } = await c.query<{ texto: string; creada_en: Date }>("select * from public.transparencia_vigente()")
      expect(rows).toHaveLength(1)
      expect(rows[0]?.texto).toBe(LARGO)
      expect(rows[0]?.creada_en).toBeInstanceOf(Date)
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["creada_en", "texto"])
    })
  })

  it("lets Coni publish: each publication is a new version and the only current one", async () => {
    await como(comoPostgres, async (c) => {
      await sinPublicar(c)
      await asumir(c, comoConi)
      expect(await publicar(c, LARGO, "Primera versión")).toBe(1)
      expect(await publicar(c, `\r\n${OTRO}  `, "Agrego una línea")).toBe(2)
      const { rows } = await c.query<{ version: number; texto: string; creada_por: string }>(
        "select version, texto, creada_por from public.transparencia_versiones where vigente",
      )
      // Line ends are normalised and the edges trimmed, as the editor counts them.
      expect(rows).toEqual([{ version: 2, texto: OTRO, creada_por: CONI }])
    })
  })

  it("going back copies that text into a new version and never rewrites the history", async () => {
    await como(comoPostgres, async (c) => {
      await sinPublicar(c)
      await asumir(c, comoConi)
      await publicar(c, LARGO, "Primera versión")
      await publicar(c, OTRO, "Agrego una línea")
      const { rows: vuelta } = await c.query<{ v: number }>("select public.volver_a_transparencia(1) as v")
      expect(vuelta[0]?.v).toBe(3)
      const { rows } = await c.query<{ version: number; texto: string; motivo: string; vigente: boolean }>(
        "select version, texto, motivo, vigente from public.transparencia_versiones where not propuesta order by version",
      )
      expect(rows).toEqual([
        { version: 1, texto: LARGO, motivo: "Primera versión", vigente: false },
        { version: 2, texto: OTRO, motivo: "Agrego una línea", vigente: false },
        { version: 3, texto: LARGO, motivo: "Volví a la versión 1", vigente: true },
      ])
    })
  })

  it("refuses a text outside 300 to 6000 characters, a change without a reason and an unknown version", async () => {
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.publicar_transparencia('Muy corto.', 'Prueba')")).message).toBe(
        "texto_fuera_de_largo",
      )
      expect(
        (await fallaCon(c, "select public.publicar_transparencia($1, 'Prueba')", ["x".repeat(6001)])).message,
      ).toBe("texto_fuera_de_largo")
      expect((await fallaCon(c, "select public.publicar_transparencia($1, '  ')", [LARGO])).message).toBe(
        "falta_motivo",
      )
      expect((await fallaCon(c, "select public.volver_a_transparencia(999)")).message).toBe("version_desconocida")
    })
  })

  it("lets nobody but Coni publish or go back", async () => {
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await fallaCon(c, "select public.publicar_transparencia($1, 'Prueba')", [LARGO])).message).toBe(
          "solo_coni_publica",
        )
        expect((await fallaCon(c, "select public.volver_a_transparencia(0)")).message).toBe("solo_coni_publica")
      })
    }
  })

  it("lets Coni and WAV read the versions and nobody write them directly", async () => {
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        expect((await c.query("select 1 from public.transparencia_versiones where propuesta")).rowCount).toBe(1)
        const error = await fallaCon(
          c,
          "insert into public.transparencia_versiones (version, texto, motivo) values (50, $1, 'Directo')",
          [LARGO],
        )
        expect(error.message).toMatch(/permission denied/)
      })
    }
    await como(comoOtra, async (c) => {
      expect((await c.query("select 1 from public.transparencia_versiones")).rowCount).toBe(0)
    })
  })

  it("lets the public call transparencia_vigente() and nothing else of this feature", async () => {
    await como(comoPostgres, async (c) => {
      for (const tabla of TABLAS) {
        await comoAnonimo(c)
        expect((await fallaCon(c, `select * from public.${tabla}`)).message).toMatch(/permission denied/)
      }
      for (const llamada of [
        "select public.publicar_transparencia('x', 'y')",
        "select public.volver_a_transparencia(0)",
        "select public.marcar_inventario_revisado()",
      ]) {
        await comoAnonimo(c)
        expect((await fallaCon(c, llamada)).message).toMatch(/permission denied/)
      }
    })
  })
})
