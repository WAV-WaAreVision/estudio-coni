import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { asumir, CONI, como, comoConi, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { borrarSembrado, leerFila, sembrarCarrusel } from "./siembra"

afterAll(() => pool.end())

type Cliente = pg.PoolClient
const HASH = "c".repeat(64)
const OTRO_HASH = "d".repeat(64)
const LAMINAS = JSON.stringify([
  { tipo: "portada", texto: "Portada" },
  { tipo: "idea", texto: "Uno" },
  { tipo: "idea", texto: "Dos" },
  { tipo: "idea", texto: "Tres" },
  { tipo: "idea", texto: "Cuatro" },
  { tipo: "cierre", texto: "¿Pregunta?" },
])
const BLOQUEA = JSON.stringify([{ regla: "mencion_avatar", tipo: "bloquea", mensaje: "Quita la mención." }])

async function nuevaVersion(
  c: Cliente,
  piezaId: string,
  hash = HASH,
  origen = "inicial",
  pedido: string | null = null,
) {
  await asumir(c, comoPostgres)
  await c.query(
    `insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, pedido)
     values ($1, coalesce((select max(version) from public.carruseles where pieza_id = $1), 0) + 1, $2::jsonb, 'Texto', $3, $4, $5)`,
    [piezaId, LAMINAS, hash, origen, pedido],
  )
}

/** A carousel the writer delivered: one version, the piece waiting for Coni's signature. */
async function porAprobar(c: Cliente, titulo = "Lo que un chatbot no ve"): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ id: string }>(
    "insert into public.piezas (titulo, tipo, destinos) values ($1, 'carrusel', '{linkedin}') returning id",
    [titulo],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el carrusel")
  await c.query("update public.piezas set estado = 'guion_en_proceso', version = version + 1 where id = $1", [id])
  await nuevaVersion(c, id)
  await asumir(c, comoServicio)
  await c.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [id])
  return id
}

const firmar = (c: Cliente, id: string, hash = HASH) =>
  c.query(
    `update public.piezas set estado = 'armando_carrusel', version = version + 1, puerta1_hash = $2, puerta1_en = now()
     where id = $1 returning estado, puerta1_por, puerta1_formula`,
    [id, hash],
  )

describe("proteger_pieza with carousels", () => {
  it("lets Coni sign a carousel's text without an avatar and records her as the signer", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      await asumir(c, comoConi)
      const { rows } = await firmar(c, id)
      expect(rows[0]).toEqual({ estado: "armando_carrusel", puerta1_por: CONI, puerta1_formula: null })
    })
  })

  it("refuses a signature whose hash is not the latest version's", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      await nuevaVersion(c, id, OTRO_HASH, "cambio_texto", "Más corto")
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'armando_carrusel', version = version + 1, puerta1_hash = $2, puerta1_en = now() where id = $1",
        [id, HASH],
      )
      expect(error).toMatchObject({ code: "42501", message: "carrusel_no_coincide" })
    })
  })

  it("refuses armando_carrusel when the signature is of a version a change request replaced", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      const version = async () =>
        (await c.query<{ version: number }>("select version from public.piezas where id = $1", [id])).rows[0]?.version
      await asumir(c, comoConi)
      await c.query(
        "update public.piezas set puerta1_hash = $2, puerta1_en = now(), version = version + 1 where id = $1",
        [id, HASH],
      )
      const { rows: pedido } = await c.query(
        "select puerta1_hash, puerta1_en, puerta1_por from public.pedir_cambio_de_carrusel($1, $2, 'Más corto')",
        [id, await version()],
      )
      expect(pedido[0]).toEqual({ puerta1_hash: null, puerta1_en: null, puerta1_por: null })
      await nuevaVersion(c, id, OTRO_HASH, "cambio_texto", "Más corto")
      await asumir(c, comoServicio)
      await c.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [id])
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'armando_carrusel', version = version + 1 where id = $1",
        [id],
      )
      expect(error).toMatchObject({ code: "42501", message: "carrusel_no_coincide" })
      const { rows } = await firmar(c, id, OTRO_HASH)
      expect(rows[0]).toMatchObject({ estado: "armando_carrusel", puerta1_por: CONI })
    })
  })

  it("refuses a carousel past gate 1 whose signature is not the latest version's, even moved by the service", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      await asumir(c, comoConi)
      await firmar(c, id)
      await nuevaVersion(c, id, OTRO_HASH, "cambio_texto", "Más corto")
      await asumir(c, comoServicio)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'carrusel_por_aprobar', version = version + 1 where id = $1",
        [id],
      )
      expect(error).toMatchObject({ code: "42501", message: "carrusel_no_coincide" })
    })
  })

  it("lets only Coni sign or enter armando_carrusel", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      await asumir(c, comoServicio)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'armando_carrusel', version = version + 1, puerta1_hash = $2, puerta1_en = now() where id = $1",
        [id, HASH],
      )
      expect(error).toMatchObject({ code: "42501", message: "solo_coni_aprueba" })
    })
  })

  it("refuses the signature while the review blocks", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      await asumir(c, comoServicio)
      await c.query("update public.piezas set revision = $2::jsonb, version = version + 1 where id = $1", [id, BLOQUEA])
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'armando_carrusel', version = version + 1, puerta1_hash = $2, puerta1_en = now() where id = $1",
        [id, HASH],
      )
      expect(error).toMatchObject({ code: "42501", message: "revision_bloquea" })
    })
  })

  it("still refuses a reel's gate 1 without an avatar", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        "insert into public.piezas (titulo, guion, texto) values ('Reel', 'Hola', 'Texto') returning id",
      )
      const id = rows[0]?.id
      await c.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [id])
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'en_render', version = version + 1, puerta1_hash = $2, puerta1_en = now() where id = $1",
        [id, HASH],
      )
      expect(error).toMatchObject({ code: "42501", message: "falta_avatar" })
    })
  })

  it("never changes a piece's type", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      const error = await fallaCon(
        c,
        "update public.piezas set tipo = 'reel', destinos = '{instagram}', version = version + 1 where id = $1",
        [id],
      )
      expect(error).toMatchObject({ code: "42501", message: "tipo_inmutable" })
    })
  })

  it("keeps Coni's session from sending a carousel back or writing the request without the function", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      await asumir(c, comoConi)
      const atras = await fallaCon(
        c,
        "update public.piezas set estado = 'guion_en_proceso', version = version + 1 where id = $1",
        [id],
      )
      expect(atras).toMatchObject({ code: "42501", message: "cambio_por_funcion" })
      const pedido = await fallaCon(
        c,
        "update public.piezas set pedido_de_cambio = 'Más corto', version = version + 1 where id = $1",
        [id],
      )
      expect(pedido).toMatchObject({ code: "42501", message: "pedido_solo_por_funcion" })
    })
  })

  it("says the carousel is ready in its own words", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c, "Lo que un chatbot no ve")
      const { rows } = await c.query("select tipo, mensaje from public.avisos where pieza_id = $1", [id])
      expect(rows).toEqual([
        { tipo: "guion_listo", mensaje: "Tu carrusel «Lo que un chatbot no ve» está listo para revisar." },
      ])
    })
  })
})

describe("pedir_cambio_de_carrusel", () => {
  const pedir = (c: Cliente, id: string, version: number, pedido: string) =>
    c.query("select * from public.pedir_cambio_de_carrusel($1, $2, $3)", [id, version, pedido])
  const versionDe = async (c: Cliente, id: string) =>
    (await c.query<{ version: number }>("select version from public.piezas where id = $1", [id])).rows[0]?.version ?? -1

  it("sends the carousel back to be rewritten with her sentence, as a new attempt", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      const antes = await versionDe(c, id)
      await asumir(c, comoConi)
      const { rows } = await pedir(c, id, antes, "  Más corto y con un ejemplo  ")
      expect(rows[0]).toMatchObject({
        estado: "guion_en_proceso",
        pedido_de_cambio: "Más corto y con un ejemplo",
        intento: 1,
        version: antes + 1,
        explicacion: null,
      })
    })
  })

  it("refuses a stale screen, someone who is not Coni, a reel and an empty or long sentence", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      const actual = await versionDe(c, id)
      await asumir(c, comoConi)
      expect(await fallaCon(c, "select public.pedir_cambio_de_carrusel($1, $2, 'x')", [id, actual - 1])).toMatchObject({
        code: "PT409",
        message: "version_desfasada",
      })
      expect(await fallaCon(c, "select public.pedir_cambio_de_carrusel($1, $2, '   ')", [id, actual])).toMatchObject({
        code: "22023",
        message: "pedido_invalido",
      })
      expect(
        await fallaCon(c, "select public.pedir_cambio_de_carrusel($1, $2, $3)", [id, actual, "x".repeat(501)]),
      ).toMatchObject({ message: "pedido_invalido" })
      await asumir(c, comoServicio)
      expect(await fallaCon(c, "select public.pedir_cambio_de_carrusel($1, $2, 'x')", [id, actual])).toMatchObject({
        code: "42501",
      })
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ id: string }>(
        "insert into public.piezas (titulo, guion, texto) values ('Reel', 'Hola', 'T') returning id",
      )
      await c.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [
        rows[0]?.id,
      ])
      await asumir(c, comoConi)
      expect(await fallaCon(c, "select public.pedir_cambio_de_carrusel($1, 1, 'x')", [rows[0]?.id])).toMatchObject({
        message: "estado_no_cambiable",
      })
    })
  })

  /** Her request, then the writer back at gate 1: with a new version, or none when Claude declined the change. */
  async function ronda(c: Cliente, id: string, conVersion: boolean, n: number) {
    await asumir(c, comoConi)
    await pedir(c, id, await versionDe(c, id), `Cambio ${n}`)
    if (conVersion) await nuevaVersion(c, id, HASH, "cambio_texto", `Cambio ${n}`)
    await asumir(c, comoServicio)
    await c.query(
      "update public.piezas set estado = 'guion_por_aprobar', pedido_de_cambio = null, version = version + 1 where id = $1",
      [id],
    )
  }

  it("stops at three text changes", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      for (let i = 0; i < 3; i++) await ronda(c, id, true, i + 1)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.pedir_cambio_de_carrusel($1, $2, 'Uno más')", [
        id,
        await versionDe(c, id),
      ])
      expect(error).toMatchObject({ code: "P0001", message: "sin_cambios_de_texto" })
    })
  })

  it("counts a request the writer could not carry out toward the three", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      await ronda(c, id, false, 1)
      await ronda(c, id, true, 2)
      await ronda(c, id, false, 3)
      const { rows } = await c.query("select cambios_de_texto from public.piezas where id = $1", [id])
      expect(rows[0]).toEqual({ cambios_de_texto: 3 })
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.pedir_cambio_de_carrusel($1, $2, 'Uno más')", [
        id,
        await versionDe(c, id),
      ])
      expect(error).toMatchObject({ code: "P0001", message: "sin_cambios_de_texto" })
    })
  })

  it("keeps Coni's session from resetting the count", async () => {
    await como(comoPostgres, async (c) => {
      const id = await porAprobar(c)
      await ronda(c, id, false, 1)
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set cambios_de_texto = 0, version = version + 1 where id = $1",
        [id],
      )
      expect(error).toMatchObject({ code: "42501", message: "cambios_solo_por_funcion" })
    })
  })
})

describe("guardar_carrusel", () => {
  async function enEscritura(c: Cliente, pedido: string | null = null): Promise<string> {
    await asumir(c, comoPostgres)
    const { rows } = await c.query<{ id: string }>(
      "insert into public.piezas (titulo, tipo, destinos) values ('C', 'carrusel', '{linkedin}') returning id",
    )
    const id = rows[0]?.id
    if (!id) throw new Error("No se creó el carrusel")
    await c.query(
      "update public.piezas set estado = 'guion_en_proceso', pedido_de_cambio = $2, version = version + 1 where id = $1",
      [id, pedido],
    )
    if (pedido !== null) await nuevaVersion(c, id)
    await c.query("select public.reservar_gasto($1, 'anthropic', 'carrusel', 0.5, $2)", [id, `clave-${id}`])
    return id
  }
  const guardar = (c: Cliente, id: string, version: number, clave = `clave-${id}`) =>
    c.query(
      "select * from public.guardar_carrusel($1, $2, $3::jsonb, 'Texto del post', $4, '[]'::jsonb, $5, 0.04, '{\"teoria\":null}'::jsonb)",
      [id, version, LAMINAS, HASH, clave],
    )

  it("stores the first version, the review and the backing, confirms the spend and bumps the piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await enEscritura(c)
      await asumir(c, comoServicio)
      // Inserted at version 0 and moved to guion_en_proceso at 1 by enEscritura.
      const { rows } = await guardar(c, id, 1)
      expect(rows[0]).toMatchObject({ id, version: 2, estado: "guion_en_proceso", pedido_de_cambio: null })
      const version = await c.query(
        "select version, origen, pedido, estado from public.carruseles where pieza_id = $1",
        [id],
      )
      expect(version.rows).toEqual([{ version: 1, origen: "inicial", pedido: null, estado: "escrito" }])
      const gasto = await c.query("select estado from public.gastos where clave = $1", [`clave-${id}`])
      expect(gasto.rows).toEqual([{ estado: "confirmado" }])
    })
  })

  it("writes a requested change as cambio_texto with her sentence and clears it from the piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await enEscritura(c, "Más corto")
      await asumir(c, comoServicio)
      const { rows } = await guardar(c, id, 1)
      expect(rows[0]?.pedido_de_cambio).toBeNull()
      const version = await c.query(
        "select version, origen, pedido from public.carruseles where pieza_id = $1 order by version",
        [id],
      )
      expect(version.rows.at(-1)).toEqual({ version: 2, origen: "cambio_texto", pedido: "Más corto" })
    })
  })

  it("saves nothing without a reserved spend, on a stale version, or on a piece that is not being written", async () => {
    await como(comoPostgres, async (c) => {
      const id = await enEscritura(c)
      await asumir(c, comoServicio)
      expect(
        await fallaCon(c, "select public.guardar_carrusel($1, 1, $2::jsonb, 'T', $3, '[]'::jsonb, 'otra', 0.04)", [
          id,
          LAMINAS,
          HASH,
        ]),
      ).toMatchObject({
        message: "gasto_no_reservado",
      })
      expect((await c.query("select 1 from public.carruseles where pieza_id = $1", [id])).rows).toHaveLength(0)
      expect(
        await fallaCon(c, "select public.guardar_carrusel($1, 0, $2::jsonb, 'T', $3, '[]'::jsonb, $4, 0.04)", [
          id,
          LAMINAS,
          HASH,
          `clave-${id}`,
        ]),
      ).toMatchObject({
        code: "PT409",
      })
      const otra = await porAprobar(c)
      await asumir(c, comoServicio)
      const version = (await c.query<{ version: number }>("select version from public.piezas where id = $1", [otra]))
        .rows[0]?.version
      expect(
        await fallaCon(c, "select public.guardar_carrusel($1, $2, $3::jsonb, 'T', $4, '[]'::jsonb, 'x', 0.04)", [
          otra,
          version,
          LAMINAS,
          HASH,
        ]),
      ).toMatchObject({
        message: "carrusel_no_se_escribe",
      })
    })
  })

  it("is not Coni's to call", async () => {
    await como(comoPostgres, async (c) => {
      const id = await enEscritura(c)
      await asumir(c, comoConi)
      expect(
        await fallaCon(c, "select public.guardar_carrusel($1, 1, $2::jsonb, 'T', $3, '[]'::jsonb, 'x', 0.04)", [
          id,
          LAMINAS,
          HASH,
        ]),
      ).toMatchObject({
        code: "42501",
      })
    })
  })
})

describe("sembrarCarrusel", () => {
  const sembradas: string[] = []
  afterAll(() => borrarSembrado(sembradas, []))

  it("walks a carousel to gate 1 and to its signature with the real transitions", async () => {
    const porAprobar = await sembrarCarrusel("guion_por_aprobar")
    const firmado = await sembrarCarrusel("armando_carrusel")
    sembradas.push(porAprobar, firmado)
    const hash = hashTextoDeCarrusel({ laminas: LAMINAS_DE_PRUEBA, textoPost: TEXTO_POST_DE_PRUEBA })
    expect(await leerFila(porAprobar)).toMatchObject({
      tipo: "carrusel",
      estado: "guion_por_aprobar",
      destinos: ["linkedin"],
    })
    expect(await leerFila(firmado)).toMatchObject({ estado: "armando_carrusel", puerta1_hash: hash, puerta1_por: CONI })
    const { rows } = await pool.query(
      "select version, hash_texto, origen, estado from public.carruseles where pieza_id = $1",
      [firmado],
    )
    expect(rows).toEqual([{ version: 1, hash_texto: hash, origen: "inicial", estado: "escrito" }])
  })
})
