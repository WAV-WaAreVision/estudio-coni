import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import type { Lamina } from "@/lib/dominio/carrusel"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"
import { asumir, comoConi, comoServicio, fallaCon, pool } from "./db"
import { crearCarruselEn } from "./flujo"

afterAll(() => pool.end())

async function enTransaccion(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await fn(c)
  } finally {
    await c.query("rollback")
    c.release()
  }
}

async function vigente(c: pg.PoolClient, id: string) {
  const { rows } = await c.query("select * from public.carruseles where pieza_id = $1 order by version desc limit 1", [
    id,
  ])
  return rows[0]
}

async function versionDe(c: pg.PoolClient, id: string): Promise<number> {
  const { rows } = await c.query("select version from public.piezas where id = $1", [id])
  return rows[0].version
}

function cambiarDiseno(c: pg.PoolClient, id: string, version: number, laminas: unknown, diseno: unknown) {
  return c.query("select public.cambiar_diseno_de_carrusel($1, $2, $3::jsonb, $4::jsonb)", [
    id,
    version,
    JSON.stringify(laminas),
    JSON.stringify(diseno),
  ])
}

describe("20261027000120: cambiar_diseno_de_carrusel checks each slide as lib/dominio/diseno-carrusel.ts does", () => {
  const conLamina = (indice: number, lamina: Record<string, unknown>) =>
    LAMINAS_DE_PRUEBA.map((actual, i) => (i === indice ? lamina : actual))

  it.each([
    ["an unknown key", conLamina(2, { ...LAMINAS_DE_PRUEBA[2], color: "rojo" })],
    ["a source line on an idea slide", conLamina(1, { ...LAMINAS_DE_PRUEBA[1], fuente: "Fuente: otra" })],
    ["a highlight from another slide", conLamina(2, { ...LAMINAS_DE_PRUEBA[2], destacado: "voz" })],
    ["a highlight that is part of a word", conLamina(2, { ...LAMINAS_DE_PRUEBA[2], destacado: "silen" })],
    ["a highlight that is not text", conLamina(2, { ...LAMINAS_DE_PRUEBA[2], destacado: 3 })],
    ["a text that is not text", conLamina(0, { tipo: "portada", texto: ["Lo que un chatbot no ve de ti"] })],
  ])("refuses %s", async (_caso, laminas) => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "carrusel_por_aprobar")
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.cambiar_diseno_de_carrusel($1, $2, $3::jsonb, $4::jsonb)", [
        id,
        await versionDe(c, id),
        JSON.stringify(laminas),
        JSON.stringify({ variante: "crema" }),
      ])
      expect(error.message).toBe("diseno_invalido")
    })
  })

  it("takes another word of the slide's own text as its highlight", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "carrusel_por_aprobar")
      await asumir(c, comoConi)
      await cambiarDiseno(
        c,
        id,
        await versionDe(c, id),
        conLamina(2, { ...LAMINAS_DE_PRUEBA[2], destacado: "difícil" }),
        { variante: "crema" },
      )
      expect((await vigente(c, id)).laminas[2].destacado).toBe("difícil")
    })
  })

  // JavaScript's \s (frasesDe, palabrasDelCarrusel) takes these as spaces; Postgres's [[:space:]] depends on the locale.
  it.each([
    ["a no-break space", " "],
    ["a zero-width no-break space", "﻿"],
  ])("splits a slide after a period followed by %s: the words are the same", async (_caso, espacio) => {
    const idea = `Un chatbot te responde a cualquier hora.${espacio}Eso ayuda, pero no te conoce.`
    const laminas: Lamina[] = LAMINAS_DE_PRUEBA.map((l, i) => (i === 1 ? { tipo: "idea", texto: idea } : l))
    const dividida = [
      laminas[0],
      { tipo: "idea", texto: "Un chatbot te responde a cualquier hora." },
      { tipo: "idea", texto: "Eso ayuda, pero no te conoce." },
      ...laminas.slice(2),
    ]
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "carrusel_por_aprobar", { laminas })
      await asumir(c, comoConi)
      await cambiarDiseno(c, id, await versionDe(c, id), dividida, { variante: "crema" })
      expect((await vigente(c, id)).laminas).toHaveLength(dividida.length)
    })
  })
})

describe("20261027000120: a rendered version keeps its files", () => {
  it.each([
    ["its state", "estado = 'fallo'"],
    ["its PDF", "pdf_clave = 'carruseles/otro.pdf'"],
    ["its PNGs", "png_claves = array_replace(png_claves, png_claves[1], 'carruseles/otra.png')"],
  ])("refuses changing %s, even as the service", async (_caso, cambio) => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "carrusel_por_aprobar")
      const v = await vigente(c, id)
      await asumir(c, comoServicio)
      const error = await fallaCon(c, `update public.carruseles set ${cambio} where id = $1`, [v.id])
      expect(error.message).toBe("carrusel_inmutable")
    })
  })
})

describe("20261027000120: Reintentar into armando_carrusel only after a failed render", () => {
  it("refuses a carousel whose error came from another step", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      await c.query(
        `update public.piezas set estado = 'error_produccion', estado_antes_del_error = 'programado',
         explicacion = 'Algo falló.', version = version + 1 where id = $1`,
        [id],
      )
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        `update public.piezas set estado = 'armando_carrusel', estado_antes_del_error = null, explicacion = null,
         intento = intento + 1, version = version + 1 where id = $1`,
        [id],
      )
      expect(error.message).toBe("firma_fuera_de_puerta1")
    })
  })
})
