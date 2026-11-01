import { readFileSync } from "node:fs"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { crearPieza } from "./flujo"

afterAll(() => pool.end())

const GUIA_DE_CONI = readFileSync(new URL("../fixtures/linea-editorial.md", import.meta.url), "utf-8")

describe("columna revision de las piezas", () => {
  it("nace vacía en una pieza nueva", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      const { rows } = await c.query<{ revision: unknown }>("select revision from public.piezas where id = $1", [id])
      expect(rows[0]?.revision).toEqual([])
    })
  })

  it("no admite nulo", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      const err = await fallaCon(c, "update public.piezas set revision = null, version = version + 1 where id = $1", [
        id,
      ])
      expect(err.code).toBe("23502")
    })
  })

  it("la guarda cuando la escribe una tarea con el rol de servicio", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await asumir(c, comoServicio)
      const hallazgos = [{ regla: "largo", tipo: "advierte", mensaje: "Muy corto" }]
      await c.query("update public.piezas set revision = $2::jsonb, version = version + 1 where id = $1", [
        id,
        JSON.stringify(hallazgos),
      ])
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ revision: unknown }>("select revision from public.piezas where id = $1", [id])
      expect(rows[0]?.revision).toEqual(hallazgos)
    })
  })
})

describe("guías", () => {
  it("trae sembrada la línea editorial de Coni como versión 2 vigente, sobre la 1 retirada", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ version: number; vigente: boolean; texto: string }>(
        "select version, vigente, texto from public.guias order by version",
      )
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({ version: 1, vigente: false })
      expect(rows[1]).toMatchObject({ version: 2, vigente: true })
      expect(rows[1]?.texto).toBe(GUIA_DE_CONI)
    })
  })

  it("lleva solo las líneas de ayuda 1455 y *4141, sin el 133", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ texto: string }>("select texto from public.guias where vigente")
      const texto = rows[0]?.texto ?? ""
      expect(texto).toContain("**Fono 1455** (SernamEG), de 08:00 a 00:00 todos los días.")
      expect(texto).toContain("(Minsal, gratis, confidencial, 24 horas)")
      expect(texto).not.toContain("133")
      expect(texto).not.toContain("Carabineros")
    })
  })

  it("no trae los formatos de sexología ni la mirada de género como tono", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ texto: string }>("select texto from public.guias where vigente")
      const texto = rows[0]?.texto ?? ""
      expect(texto).not.toContain("Ejercicio de la semana")
      expect(texto).not.toContain("Idea de sus libros")
      expect(texto).not.toContain("Mirada de género explícita")
      expect(texto).toContain("- Nunca sermonea.")
      expect(texto).toContain("La sexología no tiene pilar propio: aparece como mirada dentro de los pilares")
    })
  })

  it("admite una sola vigente", async () => {
    await como(comoServicio, async (c) => {
      const err = await fallaCon(c, "insert into public.guias (version, texto, vigente) values (3, 'otra', true)")
      expect(err.code).toBe("23505")
    })
  })

  it("admite una versión nueva vigente cuando la anterior deja de serlo", async () => {
    await como(comoServicio, async (c) => {
      await c.query("update public.guias set vigente = false where vigente")
      await c.query("insert into public.guias (version, texto, vigente) values (3, 'otra', true)")
      const { rows } = await c.query<{ version: number }>("select version from public.guias where vigente")
      expect(rows).toEqual([{ version: 3 }])
    })
  })

  it("admite varias versiones que no son la vigente", async () => {
    await como(comoServicio, async (c) => {
      await c.query("insert into public.guias (version, texto) values (3, 'a'), (4, 'b')")
      const { rows } = await c.query<{ n: number }>("select count(*)::int as n from public.guias where not vigente")
      expect(rows[0]?.n).toBe(3)
    })
  })

  it("rechaza dos filas con la misma versión", async () => {
    await como(comoServicio, async (c) => {
      const err = await fallaCon(c, "insert into public.guias (version, texto) values (1, 'repetida')")
      expect(err.code).toBe("23505")
    })
  })

  it.each([
    ["coni", comoConi],
    ["el mantenedor", comoMantenedor],
  ])("la lee %s", async (_quien, sesion) => {
    await como(sesion, async (c) => {
      const { rows } = await c.query<{ texto: string }>("select texto from public.guias where vigente")
      expect(rows[0]?.texto).toBe(GUIA_DE_CONI)
    })
  })

  it("no la ve otra persona con sesión", async () => {
    await como(comoOtra, async (c) => {
      const { rows } = await c.query("select * from public.guias")
      expect(rows).toHaveLength(0)
    })
  })

  it.each([
    ["coni", comoConi],
    ["el mantenedor", comoMantenedor],
    ["otra persona", comoOtra],
  ])("no la escribe %s", async (_quien, sesion) => {
    await como(sesion, async (c) => {
      const inserta = await fallaCon(c, "insert into public.guias (version, texto) values (9, 'x')")
      expect(inserta.code).toBe("42501")
      // Without a policy an update or delete does not fail, it matches no row.
      const edita = await c.query("update public.guias set texto = 'x'")
      expect(edita.rowCount).toBe(0)
      const borra = await c.query("delete from public.guias")
      expect(borra.rowCount).toBe(0)
    })
  })

  it("registra en la auditoría quién cambió la guía", async () => {
    await como(comoServicio, async (c) => {
      await c.query("insert into public.guias (version, texto) values (3, 'nueva')")
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ operacion: string; actor_rol: string; datos: { version: number } }>(
        "select operacion, actor_rol, datos from public.eventos where tabla = 'guias' order by id desc limit 1",
      )
      expect(rows[0]).toMatchObject({ operacion: "insert", actor_rol: "service_role", datos: { version: 3 } })
    })
  })
})
