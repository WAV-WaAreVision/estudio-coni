import { readFileSync } from "node:fs"
import path from "node:path"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, MANTENEDOR, pool } from "./db"

afterAll(() => pool.end())

type Cliente = pg.PoolClient

async function crearAutor(c: Cliente, nombre: string, tipo = "persona"): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select public.crear_autor($1, null, $2) as id", [nombre, tipo])
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el autor")
  return id
}

async function crearMaterial(c: Cliente, autorId: string, extra: { rol?: string } = {}): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('documento', $1, $2, 'hola', now(), $3) returning id`,
    [autorId, extra.rol ?? "referente", CONI],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el material")
  return id
}

/** Aliases have no RPC, so tests set them as the database owner and go back to the member. */
async function ponerAlias(
  c: Cliente,
  id: string,
  alias: string[],
  sesion: Parameters<typeof asumir>[1],
): Promise<void> {
  await asumir(c, comoPostgres)
  await c.query("update public.autores set alias = $2 where id = $1", [id, alias])
  await asumir(c, sesion)
}

describe("autores", () => {
  it("is seeded with Coni as the only author", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query("select nombre, tipo, alias from public.autores")
      expect(rows).toEqual([{ nombre: "Constanza del Rosario", tipo: "coni", alias: [] }])
    })
  })

  it("lets Coni and the maintainer read and refuses everyone else", async () => {
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        expect((await c.query("select 1 from public.autores")).rowCount).toBe(1)
      })
    }
    await como(comoOtra, async (c) => {
      expect((await c.query("select 1 from public.autores")).rowCount).toBe(0)
    })
  })

  it("does not let members write the table directly", async () => {
    await como(comoConi, async (c) => {
      const insertar = await fallaCon(c, "insert into public.autores (nombre, tipo) values ('X', 'persona')")
      expect(insertar.code).toBe("42501")
      const actualizar = await fallaCon(c, "update public.autores set nombre = 'X'")
      expect(actualizar.code).toBe("42501")
      const borrar = await fallaCon(c, "delete from public.autores")
      expect(borrar.code).toBe("42501")
    })
  })

  it("stores the normalized name ignoring case, accents and outer spaces", async () => {
    await como(comoConi, async (c) => {
      const id = await crearAutor(c, "  Esther PÉREZ ")
      const { rows } = await c.query<{ nombre: string; nombre_normalizado: string }>(
        "select nombre, nombre_normalizado from public.autores where id = $1",
        [id],
      )
      expect(rows[0]).toEqual({ nombre: "Esther PÉREZ", nombre_normalizado: "esther perez" })
    })
  })
})

describe("crear_autor", () => {
  it.each([
    ["Coni", comoConi, CONI],
    ["the maintainer", comoMantenedor, MANTENEDOR],
  ])("lets %s create an author with credential and type and records who did", async (_n, sesion, uid) => {
    await como(sesion, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        "select public.crear_autor('Esther Perel', 'Terapeuta de parejas', 'persona') as id",
      )
      const fila = (
        await c.query("select nombre, credencial, tipo, creado_por from public.autores where id = $1", [rows[0]?.id])
      ).rows[0]
      expect(fila).toEqual({
        nombre: "Esther Perel",
        credencial: "Terapeuta de parejas",
        tipo: "persona",
        creado_por: uid,
      })
    })
  })

  it("returns the existing id for a name equal ignoring case and accents, and creates nothing", async () => {
    await como(comoConi, async (c) => {
      const primero = await crearAutor(c, "Esther Pérez")
      const antes = (await c.query("select 1 from public.autores")).rowCount
      const { rows } = await c.query<{ id: string }>(
        "select public.crear_autor(' ESTHER perez ', null, 'cuenta') as id",
      )
      expect(rows[0]?.id).toBe(primero)
      expect((await c.query("select 1 from public.autores")).rowCount).toBe(antes)
    })
  })

  it("returns the existing id when the name matches an alias", async () => {
    await como(comoConi, async (c) => {
      const id = await crearAutor(c, "Esther Perel")
      await ponerAlias(c, id, ["@estherperel", "E. Perél"], comoConi)
      for (const nombre of ["@EstherPerel", "e. perel"]) {
        const { rows } = await c.query<{ id: string }>("select public.crear_autor($1, null, 'cuenta') as id", [nombre])
        expect(rows[0]?.id).toBe(id)
      }
    })
  })

  it("rejects a blank name with 22023 autor_vacio", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.crear_autor('   ', null, 'persona')")
      expect(error.code).toBe("22023")
      expect(error.message).toBe("autor_vacio")
    })
  })

  it("refuses to create a second Coni author with 22023 tipo_coni_reservado", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.crear_autor('Otra Coni', null, 'coni')")
      expect(error.code).toBe("22023")
      expect(error.message).toBe("tipo_coni_reservado")
    })
  })

  it("keeps a unique index so the table itself holds at most one Coni author", async () => {
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(c, "insert into public.autores (nombre, tipo) values ('Otra Coni', 'coni')")
      expect(error.code).toBe("23505")
    })
  })

  it("rejects an unknown type", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.crear_autor('Alguien', null, 'robot')")
      expect(error.code).toBe("23514")
    })
  })

  it("refuses anyone who is not Coni or the maintainer with 42501", async () => {
    await como(comoOtra, async (c) => {
      const error = await fallaCon(c, "select public.crear_autor('Alguien', null, 'persona')")
      expect(error.code).toBe("42501")
    })
  })

  it("leaves an audit event", async () => {
    await como(comoConi, async (c) => {
      const id = await crearAutor(c, "Auditada")
      await c.query("reset role")
      const { rows } = await c.query(
        "select operacion from public.eventos where tabla = 'autores' and datos ->> 'id' = $1",
        [id],
      )
      expect(rows).toEqual([{ operacion: "insert" }])
    })
  })
})

describe("fusionar_autores", () => {
  it("moves the materials, keeps the origin's name and aliases as aliases and deletes the origin", async () => {
    await como(comoConi, async (c) => {
      const origen = await crearAutor(c, "E. Perel", "cuenta")
      await ponerAlias(c, origen, ["@perel"], comoConi)
      const destino = await crearAutor(c, "Esther Perel")
      const material = await crearMaterial(c, origen)
      await c.query("select public.fusionar_autores($1, $2)", [origen, destino])
      const fila = (await c.query("select autor_id from public.materiales where id = $1", [material])).rows[0]
      expect(fila).toEqual({ autor_id: destino })
      const { rows } = await c.query<{ alias: string[] }>("select alias from public.autores where id = $1", [destino])
      expect([...(rows[0]?.alias ?? [])].sort()).toEqual(["@perel", "E. Perel"])
      expect((await c.query("select 1 from public.autores where id = $1", [origen])).rowCount).toBe(0)
    })
  })

  it("does not duplicate an alias the destination already has", async () => {
    await como(comoConi, async (c) => {
      const origen = await crearAutor(c, "E. Perel")
      const destino = await crearAutor(c, "Esther Perel")
      await ponerAlias(c, destino, ["e. perel"], comoConi)
      await c.query("select public.fusionar_autores($1, $2)", [origen, destino])
      const { rows } = await c.query<{ alias: string[] }>("select alias from public.autores where id = $1", [destino])
      expect(rows[0]?.alias).toEqual(["e. perel"])
    })
  })

  it("rejects the same id twice with 22023", async () => {
    await como(comoConi, async (c) => {
      const id = await crearAutor(c, "Esther")
      const error = await fallaCon(c, "select public.fusionar_autores($1, $1)", [id])
      expect(error.code).toBe("22023")
    })
  })

  it("refuses to merge the Coni author away with 22023 autor_coni_protegido but lets others merge into it", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
      const coni = rows[0]?.id
      const otra = await crearAutor(c, "Esther Perel")
      const error = await fallaCon(c, "select public.fusionar_autores($1, $2)", [coni, otra])
      expect(error.code).toBe("22023")
      expect(error.message).toBe("autor_coni_protegido")
      expect((await c.query("select 1 from public.autores where id = $1", [coni])).rowCount).toBe(1)
      await c.query("select public.fusionar_autores($1, $2)", [otra, coni])
      expect((await c.query("select 1 from public.autores where id = $1", [otra])).rowCount).toBe(0)
      expect((await c.query("select 1 from public.autores where id = $1", [coni])).rowCount).toBe(1)
    })
  })

  it("rejects a missing author with P0002", async () => {
    await como(comoConi, async (c) => {
      const id = await crearAutor(c, "Esther")
      const error = await fallaCon(c, "select public.fusionar_autores($1, gen_random_uuid())", [id])
      expect(error.code).toBe("P0002")
    })
  })

  it("refuses anyone else with 42501", async () => {
    await como(comoOtra, async (c) => {
      const error = await fallaCon(c, "select public.fusionar_autores(gen_random_uuid(), gen_random_uuid())")
      expect(error.code).toBe("42501")
    })
  })
})

describe("borrar_autor", () => {
  it("deletes an author without materials", async () => {
    await como(comoMantenedor, async (c) => {
      const id = await crearAutor(c, "Sobrante")
      await c.query("select public.borrar_autor($1)", [id])
      expect((await c.query("select 1 from public.autores where id = $1", [id])).rowCount).toBe(0)
    })
  })

  it("refuses an author with materials with 22023 autor_con_materiales", async () => {
    await como(comoConi, async (c) => {
      const id = await crearAutor(c, "Con material")
      await crearMaterial(c, id)
      const error = await fallaCon(c, "select public.borrar_autor($1)", [id])
      expect(error.code).toBe("22023")
      expect(error.message).toBe("autor_con_materiales")
    })
  })

  it("refuses the Coni author with 22023 autor_coni_protegido", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
      const error = await fallaCon(c, "select public.borrar_autor($1)", [rows[0]?.id])
      expect(error.code).toBe("22023")
      expect(error.message).toBe("autor_coni_protegido")
    })
  })

  it("reports a missing author with P0002 and refuses anyone else with 42501", async () => {
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.borrar_autor(gen_random_uuid())")).code).toBe("P0002")
    })
    await como(comoOtra, async (c) => {
      expect((await fallaCon(c, "select public.borrar_autor(gen_random_uuid())")).code).toBe("42501")
    })
  })
})

describe("materiales con autor y rol", () => {
  it("refuses to delete an author that has materials", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        "insert into public.autores (nombre, tipo) values ('Con material', 'persona') returning id",
      )
      const id = rows[0]?.id ?? ""
      await crearMaterial(c, id)
      const error = await fallaCon(c, "delete from public.autores where id = $1", [id])
      expect(error.code).toBe("23503")
    })
  })

  it("defaults the role to referente and accepts only the four roles", async () => {
    await como(comoConi, async (c) => {
      const autor = await crearAutor(c, "Esther")
      const material = await crearMaterial(c, autor)
      const { rows } = await c.query("select rol from public.materiales where id = $1", [material])
      expect(rows[0]).toEqual({ rol: "referente" })
      for (const rol of ["voz_propia", "evidencia", "estrategia"]) {
        await crearMaterial(c, autor, { rol })
      }
      const error = await fallaCon(
        c,
        `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'otro', 'x', now(), $2)`,
        [autor, CONI],
      )
      expect(error.code).toBe("23514")
    })
  })

  it("requires an author but not a category", async () => {
    await como(comoConi, async (c) => {
      const sinAutor = await fallaCon(
        c,
        `insert into public.materiales (tipo, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', 'x', now(), $1)`,
        [CONI],
      )
      expect(sinAutor.code).toBe("23502")
      const autor = await crearAutor(c, "Esther")
      const material = await crearMaterial(c, autor)
      const { rows } = await c.query("select categoria_id from public.materiales where id = $1", [material])
      expect(rows[0]).toEqual({ categoria_id: null })
    })
  })

  it("lets members change a material's author and role", async () => {
    await como(comoConi, async (c) => {
      const uno = await crearAutor(c, "Uno")
      const dos = await crearAutor(c, "Dos")
      const material = await crearMaterial(c, uno)
      await c.query("update public.materiales set autor_id = $2, rol = 'evidencia' where id = $1", [material, dos])
      const { rows } = await c.query("select autor_id, rol from public.materiales where id = $1", [material])
      expect(rows[0]).toEqual({ autor_id: dos, rol: "evidencia" })
    })
  })
})

describe("backfill de autores", () => {
  function leerBloque(): string {
    const migracion = readFileSync(path.join(__dirname, "../../supabase/migrations/20261003000300_autores.sql"), "utf8")
    return migracion.split("-- backfill:start")[1]?.split("-- backfill:end")[0] ?? ""
  }

  async function sembrarAntiguos(c: Cliente): Promise<void> {
    await c.query("alter table public.materiales alter column autor_id drop not null")
    const filas: [string | null][] = [
      ["Constanza del Rosario"],
      [" esther PÉREZ "],
      ["Esther Perez"],
      ["Brené Brown"],
      ["   "],
      [null],
    ]
    for (const [autor] of filas) {
      await c.query(
        `insert into public.materiales (tipo, autor, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2)`,
        [autor, CONI],
      )
    }
    await c.query(leerBloque())
  }

  it("contains the backfill block", () => {
    expect(leerBloque().trim().length).toBeGreaterThan(0)
  })

  it("creates one author per distinct normalized name, maps Coni to the seeded author and links every material", async () => {
    await como(comoPostgres, async (c) => {
      await sembrarAntiguos(c)
      const { rows } = await c.query<{ nombre_normalizado: string; n: string }>(
        `select a.nombre_normalizado, count(m.id) as n from public.autores a
         left join public.materiales m on m.autor_id = a.id
         group by a.nombre_normalizado order by a.nombre_normalizado`,
      )
      expect(rows.map((r) => [r.nombre_normalizado, Number(r.n)])).toEqual([
        ["brene brown", 1],
        ["constanza del rosario", 1],
        ["esther perez", 2],
        ["sin autor", 2],
      ])
      expect((await c.query("select 1 from public.materiales where autor_id is null")).rowCount).toBe(0)
      const coni = await c.query("select tipo from public.autores where nombre = 'Constanza del Rosario'")
      expect(coni.rows).toEqual([{ tipo: "coni" }])
    })
  })

  it("makes autor_id not null afterwards", async () => {
    await como(comoPostgres, async (c) => {
      await sembrarAntiguos(c)
      const { rows } = await c.query(
        "select is_nullable from information_schema.columns where table_name = 'materiales' and column_name = 'autor_id'",
      )
      expect(rows[0]).toEqual({ is_nullable: "NO" })
    })
  })

  it("creates no 'Sin autor' author when every material has one", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("alter table public.materiales alter column autor_id drop not null")
      await c.query(leerBloque())
      expect((await c.query("select 1 from public.autores where nombre = 'Sin autor'")).rowCount).toBe(0)
    })
  })
})
