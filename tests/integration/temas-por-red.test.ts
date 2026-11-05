import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, pool } from "./db"

const SUFIJO = randomUUID().slice(0, 8)
const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`

type Red = "linkedin" | "instagram"
type Estado = "esperando" | "para_subir" | "subido_a_mano" | "publicado"

afterAll(async () => {
  await pool.end()
})

async function tema(c: pg.PoolClient, nombre: string, fusionadoEn: string | null = null): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.temas (nombre, centroide, fusionado_en) values ($1, $2::extensions.vector, $3) returning id",
    [`${nombre} ${SUFIJO}`, CENTROIDE, fusionadoEn],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el tema ${nombre}`)
  return id
}

/**
 * A piece whose idea's theory lists `temas` (or, without a theory, an idea of her own), with one `publicaciones` row
 * per destination. LinkedIn's `publicado` needs a post URN, made up from the piece id as `marcarPublicacion` does.
 */
async function pieza(
  c: pg.PoolClient,
  temas: readonly string[],
  salidas: readonly { destino: Red; estado: Estado }[],
  conTeoria = true,
): Promise<string> {
  let teoria: string | null = null
  if (conTeoria) {
    const { rows } = await c.query<{ id: string }>(
      "insert into public.teorias (titulo, tesis, origen, temas) values ('Teoría', 'Tesis', 'motor', $1::uuid[]) returning id",
      [temas],
    )
    teoria = rows[0]?.id ?? null
  }
  const { rows: idea } = await c.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, formato, fuerza, estado, origen, teoria_id)
     values ('bienestar-e-impacto', 'Gancho', 'Carrusel', 'alta', 'usada', $1, $2) returning id`,
    [conTeoria ? "motor" : "propia", teoria],
  )
  const { rows: creada } = await c.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, 'Pieza') returning id",
    [idea[0]?.id],
  )
  const id = creada[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  for (const { destino, estado } of salidas) {
    await c.query(
      `insert into public.publicaciones (pieza_id, destino, estado, marcado_en, post_urn)
       values ($1::uuid, $2::text, $3::text, now(),
               case when $2::text = 'linkedin' and $3::text = 'publicado' then 'urn:li:share:' || abs(hashtext($1::text)) end)`,
      [id, destino, estado],
    )
  }
  return id
}

async function tratados(c: pg.PoolClient, temas: readonly string[]) {
  const { rows } = await c.query<{ tema_id: string; red: string }>(
    "select tema_id, red from public.temas_tratados where tema_id = any($1::uuid[]) order by red, tema_id",
    [temas],
  )
  return rows
}

describe("temas_tratados", () => {
  it("counts a topic as treated on the network where a piece went out, and only there", async () => {
    await como(comoPostgres, async (c) => {
      const carga = await tema(c, "Carga")
      await pieza(c, [carga], [
        { destino: "linkedin", estado: "publicado" },
        { destino: "instagram", estado: "para_subir" },
      ])
      await asumir(c, comoConi)
      expect(await tratados(c, [carga])).toEqual([{ tema_id: carga, red: "linkedin" }])
    })
  })

  it("counts a piece uploaded by hand, never one still waiting or to upload", async () => {
    await como(comoPostgres, async (c) => {
      const aMano = await tema(c, "A mano")
      const pendiente = await tema(c, "Pendiente")
      await pieza(c, [aMano], [{ destino: "instagram", estado: "subido_a_mano" }])
      await pieza(c, [pendiente], [
        { destino: "linkedin", estado: "esperando" },
        { destino: "instagram", estado: "para_subir" },
      ])
      await asumir(c, comoConi)
      expect(await tratados(c, [aMano, pendiente])).toEqual([{ tema_id: aMano, red: "instagram" }])
    })
  })

  it("counts a merged topic for the one that stayed, through five merges at most, as destinoDeTema", async () => {
    await como(comoPostgres, async (c) => {
      const vivo = await tema(c, "Vivo")
      const cadena = [vivo]
      for (let paso = 1; paso <= 6; paso++) cadena.unshift(await tema(c, `Paso ${paso}`, cadena[0] ?? null))
      // cadena[0] is six merges away from the live topic, cadena[1] five.
      await pieza(c, [cadena[0] ?? ""], [{ destino: "linkedin", estado: "publicado" }])
      await asumir(c, comoConi)
      expect(await tratados(c, cadena)).toEqual([])
      await asumir(c, comoPostgres)
      await pieza(c, [cadena[1] ?? ""], [{ destino: "linkedin", estado: "publicado" }])
      await asumir(c, comoConi)
      expect(await tratados(c, cadena)).toEqual([{ tema_id: vivo, red: "linkedin" }])
    })
  })

  it("does not count an idea without a theory yet", async () => {
    await como(comoPostgres, async (c) => {
      const propio = await tema(c, "Propio")
      await pieza(c, [propio], [{ destino: "linkedin", estado: "publicado" }], false)
      await asumir(c, comoConi)
      expect(await tratados(c, [propio])).toEqual([])
    })
  })

  it("is read through row level security: Coni sees it, WAV sees nothing because only Coni reads publicaciones", async () => {
    await como(comoPostgres, async (c) => {
      const carga = await tema(c, "Leído")
      await pieza(c, [carga], [{ destino: "linkedin", estado: "subido_a_mano" }])
      await asumir(c, comoConi)
      expect(await tratados(c, [carga])).toEqual([{ tema_id: carga, red: "linkedin" }])
      await asumir(c, comoMantenedor)
      expect(await tratados(c, [carga])).toEqual([])
    })
  })
})

async function darPilar(c: pg.PoolClient, temaId: string, slug: string, fuerza: "alta" | "media" | null) {
  await c.query(
    `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
     select $1::uuid, c.id, c.red, c.es_capa, $3::text, 'coni' from public.categorias c where c.slug = $2`,
    [temaId, slug, fuerza],
  )
}

async function pilarDe(c: pg.PoolClient, slug: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select id from public.categorias where slug = $1", [slug])
  const id = rows[0]?.id
  if (!id) throw new Error(`Falta el pilar ${slug}`)
  return id
}

async function deRed(c: pg.PoolClient, red: string, pilar: string | null, temas: readonly string[]) {
  const { rows } = await c.query<{ id: string; tratado: boolean }>(
    "select id, tratado from public.temas_de_red($1::text, $2::uuid) where id = any($3::uuid[]) order by nombre",
    [red, pilar, temas],
  )
  return rows
}

/** Four live topics (by name order) and a merged one; only the first went out, on LinkedIn. */
async function escena(c: pg.PoolClient) {
  const principal = await tema(c, "A principal")
  const secundario = await tema(c, "B secundario")
  const conCapa = await tema(c, "C capa")
  const sinPilares = await tema(c, "D sin pilares")
  const fusionado = await tema(c, "E fusionado", principal)
  await darPilar(c, principal, "bienestar-e-impacto", "alta")
  await darPilar(c, secundario, "diagnostico-doble", "alta")
  await darPilar(c, secundario, "bienestar-e-impacto", "media")
  await darPilar(c, conCapa, "capa-tdah", null)
  await pieza(c, [principal], [{ destino: "linkedin", estado: "subido_a_mano" }])
  return { principal, secundario, conCapa, sinPilares, todos: [principal, secundario, conCapa, sinPilares, fusionado] }
}

describe("temas_de_red", () => {
  it("without a pillar lists every live topic, saying whether it went out on that network", async () => {
    await como(comoPostgres, async (c) => {
      const { principal, secundario, conCapa, sinPilares, todos } = await escena(c)
      await asumir(c, comoConi)
      expect(await deRed(c, "linkedin", null, todos)).toEqual([
        { id: principal, tratado: true },
        { id: secundario, tratado: false },
        { id: conCapa, tratado: false },
        { id: sinPilares, tratado: false },
      ])
      expect((await deRed(c, "instagram", null, todos)).map((fila) => fila.tratado)).toEqual([
        false,
        false,
        false,
        false,
      ])
    })
  })

  it("with a pillar of that network lists the topics it is the main pillar of, never one it is a secondary of", async () => {
    await como(comoPostgres, async (c) => {
      const { principal, todos } = await escena(c)
      const bienestar = await pilarDe(c, "bienestar-e-impacto")
      await asumir(c, comoConi)
      expect(await deRed(c, "linkedin", bienestar, todos)).toEqual([{ id: principal, tratado: true }])
    })
  })

  it("with a layer lists the topics that carry it", async () => {
    await como(comoPostgres, async (c) => {
      const { conCapa, todos } = await escena(c)
      const capa = await pilarDe(c, "capa-tdah")
      await asumir(c, comoConi)
      expect(await deRed(c, "instagram", capa, todos)).toEqual([{ id: conCapa, tratado: false }])
    })
  })

  it("with a pillar of the other network or an unknown one lists nothing", async () => {
    await como(comoPostgres, async (c) => {
      const { todos } = await escena(c)
      const bienestar = await pilarDe(c, "bienestar-e-impacto")
      const capa = await pilarDe(c, "capa-tdah")
      await asumir(c, comoConi)
      expect(await deRed(c, "instagram", bienestar, todos)).toEqual([])
      expect(await deRed(c, "linkedin", capa, todos)).toEqual([])
      expect(await deRed(c, "linkedin", randomUUID(), todos)).toEqual([])
    })
  })

  it("leaves temas_de_pilar as it was, for the old code until the cleanup", async () => {
    await como(comoPostgres, async (c) => {
      const { principal, todos } = await escena(c)
      const bienestar = await pilarDe(c, "bienestar-e-impacto")
      await asumir(c, comoConi)
      const { rows } = await c.query<{ id: string }>(
        "select id from public.temas_de_pilar($1::uuid) where id = any($2::uuid[])",
        [bienestar, todos],
      )
      expect(rows).toEqual([{ id: principal }])
    })
  })

  it("is read through row level security: WAV gets every topic, none treated", async () => {
    await como(comoPostgres, async (c) => {
      const { todos } = await escena(c)
      await asumir(c, comoMantenedor)
      expect((await deRed(c, "linkedin", null, todos)).map((fila) => fila.tratado)).toEqual([
        false,
        false,
        false,
        false,
      ])
    })
  })
})
