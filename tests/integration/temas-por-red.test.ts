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
