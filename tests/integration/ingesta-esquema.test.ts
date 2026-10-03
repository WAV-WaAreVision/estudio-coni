import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import {
  asumir,
  CONI,
  como,
  comoConi,
  comoMantenedor,
  comoOtra,
  comoPostgres,
  comoServicio,
  fallaCon,
  MANTENEDOR,
  pool,
} from "./db"

afterAll(() => pool.end())

type Cliente = pg.PoolClient

async function idCategoria(c: Cliente, slug: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select id from public.categorias where slug = $1", [slug])
  const fila = rows[0]
  if (!fila) throw new Error(`No existe la categoría ${slug}`)
  return fila.id
}

async function crearMaterial(c: Cliente, extra: { tipo?: string; texto?: string } = {}): Promise<string> {
  const categoria = await idCategoria(c, "general")
  const { rows } = await c.query<{ id: string }>(
    `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en)
     values ($1, $2, $3, now()) returning id`,
    [extra.tipo ?? "documento", categoria, extra.texto ?? "hola"],
  )
  const fila = rows[0]
  if (!fila) throw new Error("No se creó el material")
  return fila.id
}

async function crearFicha(c: Cliente, materialId: string): Promise<void> {
  await c.query(
    `insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente)
     values ($1, 'r', '[]', '[]', '{}')`,
    [materialId],
  )
}

describe("categorias", () => {
  it("is seeded with the six categories and no author", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ slug: string; nombre: string; creada_por: string | null }>(
        "select slug, nombre, creada_por from public.categorias order by slug",
      )
      expect(rows).toEqual(
        [
          { slug: "autoestima", nombre: 'Autoestima y "ser tu propia diosa"' },
          { slug: "bienestar", nombre: "Bienestar emocional" },
          { slug: "deseo", nombre: "Deseo y sexualidad" },
          { slug: "general", nombre: "General" },
          { slug: "limites", nombre: "Género y límites" },
          { slug: "pareja", nombre: "Pareja y conversación" },
        ].map((f) => ({ ...f, creada_por: null })),
      )
    })
  })

  it.each([
    ["Coni", comoConi, CONI],
    ["the maintainer", comoMantenedor, MANTENEDOR],
  ])("lets %s create a category and records who did", async (_n, sesion, id) => {
    await como(sesion, async (c) => {
      const { rows } = await c.query<{ id: string }>("select public.crear_categoria('Duelo') as id")
      const nueva = rows[0]?.id
      const { rows: filas } = await c.query<{ nombre: string; creada_por: string }>(
        "select nombre, creada_por from public.categorias where id = $1",
        [nueva],
      )
      expect(filas[0]).toEqual({ nombre: "Duelo", creada_por: id })
    })
  })

  it("returns the existing id for a name equal ignoring case and accents, and creates nothing", async () => {
    await como(comoConi, async (c) => {
      const existente = await idCategoria(c, "limites")
      const antes = await c.query("select 1 from public.categorias")
      const { rows } = await c.query<{ id: string }>("select public.crear_categoria('  GENERO y limites ') as id")
      expect(rows[0]?.id).toBe(existente)
      expect((await c.query("select 1 from public.categorias")).rowCount).toBe(antes.rowCount)
    })
  })

  it("rejects a blank name with 22023 categoria_vacia", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.crear_categoria('   ')")
      expect(error.code).toBe("22023")
      expect(error.message).toBe("categoria_vacia")
    })
  })

  it("refuses anyone who is not Coni or the maintainer with 42501", async () => {
    await como(comoOtra, async (c) => {
      expect((await fallaCon(c, "select public.crear_categoria('Duelo')")).code).toBe("42501")
    })
  })

  it("does not let members write the table directly", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "insert into public.categorias (slug, nombre) values ('x', 'X')")
      expect(error.code).toBe("42501")
    })
  })

  it("renames for Coni and the maintainer", async () => {
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        const id = await idCategoria(c, "bienestar")
        await c.query("select public.renombrar_categoria($1, 'Salud mental')", [id])
        const { rows } = await c.query<{ nombre: string }>("select nombre from public.categorias where id = $1", [id])
        expect(rows[0]?.nombre).toBe("Salud mental")
      })
    }
  })

  it("refuses to rename onto another category's name with categoria_repetida", async () => {
    await como(comoConi, async (c) => {
      const id = await idCategoria(c, "bienestar")
      const error = await fallaCon(c, "select public.renombrar_categoria($1, 'DESEO y sexualidad')", [id])
      expect(error.message).toBe("categoria_repetida")
    })
  })

  it("lets a category be renamed to a differently cased version of its own name", async () => {
    await como(comoConi, async (c) => {
      const id = await idCategoria(c, "bienestar")
      await c.query("select public.renombrar_categoria($1, 'BIENESTAR emocional')", [id])
      const { rows } = await c.query<{ nombre: string }>("select nombre from public.categorias where id = $1", [id])
      expect(rows[0]?.nombre).toBe("BIENESTAR emocional")
    })
  })

  it("refuses renaming for anyone else with 42501", async () => {
    await como(comoOtra, async (c) => {
      const error = await fallaCon(c, "select public.renombrar_categoria(gen_random_uuid(), 'X')")
      expect(error.code).toBe("42501")
    })
  })

  it("refuses to delete a category that has materials", async () => {
    await como(comoConi, async (c) => {
      await crearMaterial(c)
    })
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      await c.query(
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2)`,
        [categoria, CONI],
      )
      const error = await fallaCon(c, "delete from public.categorias where id = $1", [categoria])
      expect(error.code).toBe("23503")
    })
  })
})

describe("materiales", () => {
  it("defaults to procesando and stamps the uploader", async () => {
    await como(comoMantenedor, async (c) => {
      const id = await crearMaterial(c)
      const { rows } = await c.query<{ estado: string; subido_por: string; etiquetas: string[] }>(
        "select estado, subido_por, etiquetas from public.materiales where id = $1",
        [id],
      )
      expect(rows[0]).toEqual({ estado: "procesando", subido_por: MANTENEDOR, etiquetas: [] })
    })
  })

  it("lets a member supply the material id", async () => {
    await como(comoConi, async (c) => {
      const categoria = await idCategoria(c, "general")
      const id = crypto.randomUUID()
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (id, tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en)
         values ($1, 'documento', $2, 'x', now()) returning id`,
        [id, categoria],
      )
      expect(rows[0]?.id).toBe(id)
    })
  })

  it("refuses to attribute the upload to someone else", async () => {
    await como(comoMantenedor, async (c) => {
      const categoria = await idCategoria(c, "general")
      const error = await fallaCon(
        c,
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2)`,
        [categoria, CONI],
      )
      expect(error.code).toBe("42501")
    })
  })

  it("refuses a stranger", async () => {
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      await c.query("set local role authenticated")
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: "b0000000-0000-4000-8000-000000000003", role: "authenticated" }),
      ])
      const error = await fallaCon(
        c,
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en)
         values ('documento', $1, 'x', now())`,
        [categoria],
      )
      expect(error.code).toBe("42501")
    })
  })

  it("requires the no-patients declaration and a category", async () => {
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      const sinDeclaracion = await fallaCon(
        c,
        "insert into public.materiales (tipo, categoria_id, texto_pegado, subido_por) values ('documento', $1, 'x', $2)",
        [categoria, CONI],
      )
      expect(sinDeclaracion.code).toBe("23502")
      const sinCategoria = await fallaCon(
        c,
        `insert into public.materiales (tipo, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', 'x', now(), $1)`,
        [CONI],
      )
      expect(sinCategoria.code).toBe("23502")
    })
  })

  it("accepts only the known types and states", async () => {
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      const tipo = await fallaCon(
        c,
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('podcast', $1, 'x', now(), $2)`,
        [categoria, CONI],
      )
      expect(tipo.code).toBe("23514")
      const estado = await fallaCon(
        c,
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado)
         values ('post', $1, 'x', now(), $2, 'nuevo')`,
        [categoria, CONI],
      )
      expect(estado.code).toBe("23514")
    })
  })

  it("needs a link, a file or pasted text", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(
        c,
        `insert into public.materiales (tipo, categoria_id, declaracion_sin_pacientes_en)
        select 'video', id, now() from public.categorias limit 1`,
      )
      expect(error.code).toBe("23514")
    })
  })

  it("accepts a video that is only a link reference", async () => {
    await como(comoConi, async (c) => {
      const categoria = await idCategoria(c, "general")
      await c.query(
        `insert into public.materiales (tipo, categoria_id, origen_url, declaracion_sin_pacientes_en)
         values ('video', $1, 'https://example.com/v', now())`,
        [categoria],
      )
    })
  })

  it("lets Coni and the maintainer read each other's materials but not a stranger", async () => {
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      await c.query(
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2)`,
        [categoria, MANTENEDOR],
      )
      for (const [sesion, esperadas] of [
        [comoConi, 1],
        [comoMantenedor, 1],
        [comoOtra, 0],
      ] as const) {
        await c.query("reset role")
        await c.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: sesion.tipo === "usuario" ? sesion.id : "", role: "authenticated" }),
        ])
        await c.query("set local role authenticated")
        const { rows } = await c.query("select 1 from public.materiales")
        expect(rows.length).toBe(esperadas)
      }
    })
  })

  it("lets members edit titulo, autor, categoria_id and etiquetas", async () => {
    await como(comoMantenedor, async (c) => {
      const id = await crearMaterial(c)
      const otra = await idCategoria(c, "deseo")
      await c.query(
        "update public.materiales set titulo = 'T', autor = 'A', categoria_id = $2, etiquetas = '{a,b}' where id = $1",
        [id, otra],
      )
      const { rows } = await c.query<{ titulo: string; etiquetas: string[] }>(
        "select titulo, etiquetas from public.materiales where id = $1",
        [id],
      )
      expect(rows[0]).toEqual({ titulo: "T", etiquetas: ["a", "b"] })
    })
  })

  it.each(["estado = 'listo'", "texto_clave = 'k'", "motivo_fallo = 'm'"])(
    "refuses members changing %s",
    async (cambio) => {
      await como(comoConi, async (c) => {
        const id = await crearMaterial(c)
        const error = await fallaCon(c, `update public.materiales set ${cambio} where id = $1`, [id])
        expect(error.code).toBe("42501")
      })
    },
  )

  it("lets the service role change the processing columns", async () => {
    let id = ""
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2) returning id`,
        [categoria, CONI],
      )
      id = rows[0]?.id ?? ""
      await c.query("reset role")
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })])
      await c.query("set local role service_role")
      await c.query(
        "update public.materiales set estado = 'listo', texto_clave = 'k', idioma_original = 'es' where id = $1",
        [id],
      )
      const { rows: filas } = await c.query<{ estado: string }>("select estado from public.materiales where id = $1", [
        id,
      ])
      expect(filas[0]?.estado).toBe("listo")
    })
  })

  it("lets Coni delete any material and the uploader delete their own, but not the other member", async () => {
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2) returning id`,
        [categoria, MANTENEDOR],
      )
      const id = rows[0]?.id
      await c.query("reset role")
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: CONI, role: "authenticated" }),
      ])
      await c.query("set local role authenticated")
      expect((await c.query("delete from public.materiales where id = $1", [id])).rowCount).toBe(1)
    })
    await como(comoMantenedor, async (c) => {
      const propio = await crearMaterial(c)
      expect((await c.query("delete from public.materiales where id = $1", [propio])).rowCount).toBe(1)
    })
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2) returning id`,
        [categoria, CONI],
      )
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: MANTENEDOR, role: "authenticated" }),
      ])
      await c.query("set local role authenticated")
      expect((await c.query("delete from public.materiales where id = $1", [rows[0]?.id])).rowCount).toBe(0)
    })
  })

  it("audits the actor on insert", async () => {
    await como(comoMantenedor, async (c) => {
      const id = await crearMaterial(c)
      const { rows } = await c.query<{ actor_usuario: string; operacion: string }>(
        "select actor_usuario, operacion from public.eventos where tabla = 'materiales' and datos ->> 'id' = $1",
        [id],
      )
      expect(rows).toEqual([{ actor_usuario: MANTENEDOR, operacion: "insert" }])
    })
  })

  it("audits category changes", async () => {
    await como(comoConi, async (c) => {
      await c.query("select public.crear_categoria('Duelo')")
      const { rows } = await c.query<{ actor_usuario: string }>(
        "select actor_usuario from public.eventos where tabla = 'categorias' and datos ->> 'nombre' = 'Duelo'",
      )
      expect(rows).toEqual([{ actor_usuario: CONI }])
    })
  })
})

describe("materiales_archivos", () => {
  it("holds up to 20 files per material, in order", async () => {
    await como(comoConi, async (c) => {
      const categoria = await idCategoria(c, "general")
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (id, tipo, categoria_id, archivo_clave, declaracion_sin_pacientes_en)
         values ($2::uuid, 'imagen', $1, 'materiales/' || $2::text || '/original-01.png', now()) returning id`,
        [categoria, crypto.randomUUID()],
      )
      const id = rows[0]?.id
      await c.query(
        "insert into public.materiales_archivos (material_id, orden, archivo_clave) select $1::uuid, g, 'materiales/' || $1::text || '/original-' || lpad(g::text, 2, '0') || '.png' from generate_series(1, 20) g",
        [id],
      )
      const error = await fallaCon(
        c,
        "insert into public.materiales_archivos (material_id, orden, archivo_clave) values ($1::uuid, 21, 'materiales/' || $1::text || '/original-20.png')",
        [id],
      )
      expect(error.code).toBe("23514")
      const repetido = await fallaCon(
        c,
        "insert into public.materiales_archivos (material_id, orden, archivo_clave) values ($1::uuid, 1, 'materiales/' || $1::text || '/original-02.png')",
        [id],
      )
      expect(repetido.code).toBe("23505")
    })
  })

  it("follows the material's access rules and cascades on delete", async () => {
    await como(comoMantenedor, async (c) => {
      const id = await crearMaterial(c)
      await c.query(
        "insert into public.materiales_archivos (material_id, orden, archivo_clave) values ($1::uuid, 1, 'materiales/' || $1::text || '/original-01.png')",
        [id],
      )
      await c.query("delete from public.materiales where id = $1", [id])
      expect((await c.query("select 1 from public.materiales_archivos where material_id = $1", [id])).rowCount).toBe(0)
    })
  })
})

describe("claves de archivo del material", () => {
  const ID = "11111111-1111-4111-8111-111111111111"
  const insertar = (clave: string | null, id = ID) =>
    `insert into public.materiales (id, tipo, categoria_id, archivo_clave, texto_pegado, declaracion_sin_pacientes_en)
     select '${id}', 'documento', id, ${clave === null ? "null" : `'${clave}'`}, 'x', now() from public.categorias limit 1`

  it.each([
    ["no file", null],
    ["its own original", `materiales/${ID}/original.pdf`],
    ["a numbered image", `materiales/${ID}/original-07.png`],
    ["the last numbered image", `materiales/${ID}/original-20.heic`],
  ])("accepts %s", async (_n, clave) => {
    await como(comoConi, async (c) => {
      await c.query(insertar(clave))
    })
  })

  it.each([
    ["another material's folder", "materiales/22222222-2222-4222-8222-222222222222/original.pdf"],
    ["the voice folder", "voces/x.mp3"],
    ["a path out of the folder", `materiales/${ID}/../x/original.pdf`],
    ["an unknown extension", `materiales/${ID}/original.exe`],
    ["an image number past 20", `materiales/${ID}/original-21.png`],
    ["a derived file name", `materiales/${ID}/texto.txt`],
  ])("rejects %s with 23514", async (_n, clave) => {
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, insertar(clave))).code).toBe("23514")
    })
  })

  it("rejects a materiales_archivos key outside its material's folder", async () => {
    await como(comoConi, async (c) => {
      await c.query(insertar(`materiales/${ID}/original-01.png`))
      const error = await fallaCon(
        c,
        "insert into public.materiales_archivos (material_id, orden, archivo_clave) values ($1, 1, 'voces/x.mp3')",
        [ID],
      )
      expect(error.code).toBe("23514")
      await c.query("insert into public.materiales_archivos (material_id, orden, archivo_clave) values ($1, 1, $2)", [
        ID,
        `materiales/${ID}/original-01.png`,
      ])
    })
  })

  it("lets only the uploader add files, and only while the material is processing", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(
        insertar(null)
          .replace("now() from", "now(), $1 from")
          .replace("declaracion_sin_pacientes_en)", "declaracion_sin_pacientes_en, subido_por)"),
        [CONI],
      )
      const archivo = `materiales/${ID}/original-01.png`
      const insertarArchivo =
        "insert into public.materiales_archivos (material_id, orden, archivo_clave) values ($1, $3::smallint, $2)"
      await asumir(c, comoMantenedor)
      expect((await fallaCon(c, insertarArchivo, [ID, archivo, 1])).code).toBe("42501")
      await asumir(c, comoConi)
      await c.query(insertarArchivo, [ID, archivo, 1])
      await asumir(c, comoPostgres)
      await c.query("update public.materiales set estado = 'listo' where id = $1", [ID])
      await asumir(c, comoConi)
      expect((await fallaCon(c, insertarArchivo, [ID, `materiales/${ID}/original-02.png`, 2])).code).toBe("42501")
    })
  })
})

describe("fichas", () => {
  it("is created by the service role only", async () => {
    await como(comoConi, async (c) => {
      const id = await crearMaterial(c)
      const error = await fallaCon(
        c,
        "insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente) values ($1, 'r', '[]', '[]', '{}')",
        [id],
      )
      expect(error.code).toBe("42501")
    })
    await como(comoServicio, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         select 'documento', id, 'x', now(), $1 from public.categorias limit 1 returning id`,
        [CONI],
      )
      await crearFicha(c, rows[0]?.id ?? "")
    })
  })

  it("lets members edit the card and stamps who and when, but not other columns", async () => {
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2) returning id`,
        [categoria, CONI],
      )
      const id = rows[0]?.id ?? ""
      await crearFicha(c, id)
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: MANTENEDOR, role: "authenticated" }),
      ])
      await c.query("set local role authenticated")
      await c.query("update public.fichas set resumen = 'nuevo', fuente = '{\"a\":1}' where material_id = $1", [id])
      const { rows: filas } = await c.query<{ resumen: string; editada_por: string; editada_en: Date | null }>(
        "select resumen, editada_por, editada_en from public.fichas where material_id = $1",
        [id],
      )
      expect(filas[0]?.resumen).toBe("nuevo")
      expect(filas[0]?.editada_por).toBe(MANTENEDOR)
      expect(filas[0]?.editada_en).not.toBeNull()
      const error = await fallaCon(c, "update public.fichas set editada_por = null where material_id = $1", [id])
      expect(error.code).toBe("42501")
    })
  })

  it("hides cards from strangers and audits changes", async () => {
    await como(comoPostgres, async (c) => {
      const categoria = await idCategoria(c, "general")
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ('documento', $1, 'x', now(), $2) returning id`,
        [categoria, CONI],
      )
      const id = rows[0]?.id ?? ""
      await crearFicha(c, id)
      // The audit log is append-only and other suites commit cards of their own, so look only at this card's events.
      const { rows: eventos } = await c.query(
        "select 1 from public.eventos where tabla = 'fichas' and datos ->> 'material_id' = $1",
        [id],
      )
      expect(eventos.length).toBe(1)
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: "b0000000-0000-4000-8000-000000000003", role: "authenticated" }),
      ])
      await c.query("set local role authenticated")
      expect((await c.query("select 1 from public.fichas")).rowCount).toBe(0)
    })
  })
})
