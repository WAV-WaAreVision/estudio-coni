import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
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

async function armar(c: pg.PoolClient, id: string) {
  await asumir(c, comoServicio)
  const v = await vigente(c, id)
  const pngs = v.laminas.map((_: unknown, i: number) => `carruseles/${id}/${v.id}/lamina-0${i + 1}.png`)
  await c.query("select public.guardar_armado($1, $2, $3, $4)", [
    v.id,
    await versionDe(c, id),
    `carruseles/${id}/${v.id}/carrusel.pdf`,
    pngs,
  ])
  return v
}

describe("palabras_de_laminas", () => {
  it("is the same for the same words on other slides", async () => {
    const dividida = [
      LAMINAS_DE_PRUEBA[0],
      { tipo: "idea", texto: "Un chatbot te responde a cualquier hora." },
      { tipo: "idea", texto: "Eso ayuda, pero no te conoce." },
      ...LAMINAS_DE_PRUEBA.slice(2),
    ]
    const { rows } = await pool.query(
      "select public.palabras_de_laminas($1::jsonb) = public.palabras_de_laminas($2::jsonb) as igual",
      [JSON.stringify(LAMINAS_DE_PRUEBA), JSON.stringify(dividida)],
    )
    expect(rows[0].igual).toBe(true)
  })
})

describe("guardar_armado", () => {
  it("marks the latest version listo with its files and puts the piece at gate 2", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      const v = await armar(c, id)
      const { rows } = await c.query(
        "select p.estado, c.estado as version, c.pdf_clave, cardinality(c.png_claves) as pngs from public.piezas p join public.carruseles c on c.pieza_id = p.id where p.id = $1",
        [id],
      )
      expect(rows[0]).toEqual({
        estado: "carrusel_por_aprobar",
        version: "listo",
        pdf_clave: `carruseles/${id}/${v.id}/carrusel.pdf`,
        pngs: LAMINAS_DE_PRUEBA.length,
      })
    })
  })

  it("refuses incomplete files, a stale piece version and Coni's session", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      const v = await vigente(c, id)
      const version = await versionDe(c, id)
      const corta = await fallaCon(c, "select public.guardar_armado($1, $2, 'x.pdf', array['a.png'])", [v.id, version])
      expect(corta.message).toBe("armado_incompleto")
      const vieja = await fallaCon(c, "select public.guardar_armado($1, $2, 'x.pdf', array['a.png'])", [
        v.id,
        version - 1,
      ])
      expect(vieja.message).toBe("version_desfasada")
      await asumir(c, comoConi)
      const coni = await fallaCon(c, "select public.guardar_armado($1, $2, 'x.pdf', array['a.png'])", [v.id, version])
      expect(coni.code).toBe("42501")
    })
  })
})

describe("guardar_acortado", () => {
  it("writes the shortened text as a new version, back to gate 1, and confirms the spend", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      const v = await vigente(c, id)
      await c.query(
        `insert into public.gastos (pieza_id, proveedor, paso, mes, estimado_usd, clave)
         values ($1, 'anthropic', 'carrusel', date_trunc('month', now())::date, 0.2, 'acortar-prueba')`,
        [id],
      )
      const laminas = LAMINAS_DE_PRUEBA.map((l, i) =>
        i === 1 ? { ...l, texto: "Un chatbot responde. No te conoce." } : l,
      )
      const hash = hashTextoDeCarrusel({ laminas, textoPost: TEXTO_POST_DE_PRUEBA })
      await c.query("select public.guardar_acortado($1, $2, $3::jsonb, $4, '[]'::jsonb, $5, 'acortar-prueba', 0.05)", [
        v.id,
        await versionDe(c, id),
        JSON.stringify(laminas),
        hash,
        "Acorté la lámina 2 para que quepa. Léela y fírmala de nuevo.",
      ])
      const nueva = await vigente(c, id)
      expect(nueva).toMatchObject({
        origen: "acortado",
        hash_texto: hash,
        texto_post: TEXTO_POST_DE_PRUEBA,
        estado: "escrito",
      })
      const pieza = (await c.query("select estado, puerta1_hash, explicacion from public.piezas where id = $1", [id]))
        .rows[0]
      expect(pieza).toEqual({
        estado: "guion_por_aprobar",
        puerta1_hash: null,
        explicacion: "Acorté la lámina 2 para que quepa. Léela y fírmala de nuevo.",
      })
      const gasto = (await c.query("select estado from public.gastos where clave = 'acortar-prueba'")).rows[0]
      expect(gasto.estado).toBe("confirmado")
    })
  })
})

describe("cambiar_diseno_de_carrusel", () => {
  const diseno = { variante: "oscura" }

  it("writes a new version with the same words and post and sends the piece to be rendered", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      const v = await armar(c, id)
      await asumir(c, comoConi)
      await c.query("select public.cambiar_diseno_de_carrusel($1, $2, $3::jsonb, $4::jsonb)", [
        id,
        await versionDe(c, id),
        JSON.stringify(LAMINAS_DE_PRUEBA),
        JSON.stringify(diseno),
      ])
      const nueva = await vigente(c, id)
      expect(nueva).toMatchObject({ origen: "cambio_diseno", hash_texto: v.hash_texto, diseno, estado: "escrito" })
      const pieza = (await c.query("select estado, cambios_de_texto from public.piezas where id = $1", [id])).rows[0]
      expect(pieza).toEqual({ estado: "armando_carrusel", cambios_de_texto: 0 })
    })
  })

  it("refuses other words, a changed portada, an unknown variant and no change at all", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await armar(c, id)
      await asumir(c, comoConi)
      const version = await versionDe(c, id)
      const intentar = (laminas: unknown, d: unknown) =>
        fallaCon(c, "select public.cambiar_diseno_de_carrusel($1, $2, $3::jsonb, $4::jsonb)", [
          id,
          version,
          JSON.stringify(laminas),
          JSON.stringify(d),
        ])
      const otras = LAMINAS_DE_PRUEBA.map((l, i) => (i === 2 ? { ...l, texto: `${l.texto} Y algo más.` } : l))
      expect((await intentar(otras, diseno)).message).toBe("diseno_invalido")
      expect((await intentar(LAMINAS_DE_PRUEBA, { variante: "neon" })).message).toBe("diseno_invalido")
      expect((await intentar(LAMINAS_DE_PRUEBA, { variante: "crema" })).message).toBe("diseno_sin_cambio")
    })
  })
})

describe("pedir_cambio_de_carrusel at gate 2", () => {
  it("takes the signature back and counts the change", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await armar(c, id)
      await asumir(c, comoConi)
      await c.query("select public.pedir_cambio_de_carrusel($1, $2, 'Más corto')", [id, await versionDe(c, id)])
      const pieza = (
        await c.query(
          "select estado, puerta1_hash, cambios_de_texto, pedido_de_cambio from public.piezas where id = $1",
          [id],
        )
      ).rows[0]
      expect(pieza).toEqual({
        estado: "guion_en_proceso",
        puerta1_hash: null,
        cambios_de_texto: 1,
        pedido_de_cambio: "Más corto",
      })
    })
  })
})
