import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { leerVocabulario } from "@/lib/datos/vocabulario"
import { EVIDENCIAS_DE_AFIRMACION, TIPOS_DE_AFIRMACION } from "@/lib/proveedores/anthropic"
import { CONI, como, comoConi, comoServicio, fallaCon, pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

describe("versiones_de_vocabulario", () => {
  it("loads one vigente starting list per list and network", async () => {
    await como(comoServicio, async (c) => {
      const { rows } = await c.query<{ lista: string; red: string; n: number }>(
        `select lista, red, jsonb_array_length(valores) as n from public.versiones_de_vocabulario
         where estado = 'vigente' order by lista, red`,
      )
      expect(rows).toEqual([
        { lista: "dolor", red: "instagram", n: 6 },
        { lista: "dolor", red: "linkedin", n: 6 },
        { lista: "emocion", red: "todas", n: 22 },
        { lista: "evidencia", red: "todas", n: 5 },
        { lista: "gancho", red: "todas", n: 12 },
        { lista: "publico", red: "instagram", n: 3 },
        { lista: "publico", red: "linkedin", n: 9 },
        { lista: "tipo", red: "todas", n: 8 },
      ])
    })
  })

  it("gives every emotion a group, and activation except the two fallbacks", async () => {
    await como(comoServicio, async (c) => {
      const { rows } = await c.query<{ grupo: string; n: number }>(
        `select v->>'grupo' as grupo, count(*)::int as n
         from public.versiones_de_vocabulario, jsonb_array_elements(valores) v
         where lista = 'emocion' and estado = 'vigente' group by 1 order by 1`,
      )
      expect(rows).toEqual([
        { grupo: "problema", n: 11 },
        { grupo: "puente", n: 2 },
        { grupo: "respaldo", n: 2 },
        { grupo: "solucion", n: 7 },
      ])
      const sinActivacion = await c.query<{ valor: string }>(
        `select v->>'valor' as valor
         from public.versiones_de_vocabulario, jsonb_array_elements(valores) v
         where lista = 'emocion' and estado = 'vigente' and v->>'activacion' is null order by 1`,
      )
      expect(sinActivacion.rows.map((r) => r.valor)).toEqual(["informativa", "otra"])
    })
  })

  it("refuses a second vigente version for the same list and network", async () => {
    await como(comoServicio, async (c) => {
      const error = await fallaCon(
        c,
        `insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores, estado)
         values ('gancho', 'todas', 'otra', 'prueba', '[{"valor":"x","etiqueta":"X"}]', 'vigente')`,
      )
      expect(error.code).toBe("23505")
      expect(error.constraint).toBe("vocabulario_uno_vigente")
    })
  })

  it("refuses values without valor or etiqueta, and emotions without a valid group", async () => {
    await como(comoServicio, async (c) => {
      const sinEtiqueta = await fallaCon(
        c,
        `insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores)
         values ('gancho', 'todas', 'mal', 'prueba', '[{"valor":"x"}]')`,
      )
      expect(sinEtiqueta.constraint).toBe("versiones_de_vocabulario_valores_check")
      const sinGrupo = await fallaCon(
        c,
        `insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores)
         values ('emocion', 'todas', 'mal', 'prueba', '[{"valor":"x","etiqueta":"X","grupo":"otro"}]')`,
      )
      expect(sinGrupo.constraint).toBe("versiones_de_vocabulario_valores_check")
    })
  })

  it("lets Coni read the lists and not write them", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query("select id from public.versiones_de_vocabulario")
      expect(rows.length).toBe(8)
      const error = await fallaCon(
        c,
        `insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores)
         values ('gancho', 'todas', 'x', 'x', '[{"valor":"x","etiqueta":"X"}]')`,
      )
      expect(error.code).toBe("42501")
    })
  })
})

const valoresDelCheck = (nombre: string) =>
  como(comoServicio, async (c) => {
    const { rows } = await c.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1",
      [nombre],
    )
    return [...(rows[0]?.def ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
  })

describe("tipo and evidencia lists", () => {
  it("keeps the code lists equal to the database checks", async () => {
    expect(await valoresDelCheck("afirmaciones_tipo_check")).toEqual([...TIPOS_DE_AFIRMACION].sort())
    expect(await valoresDelCheck("afirmaciones_evidencia_check")).toEqual([...EVIDENCIAS_DE_AFIRMACION].sort())
  })
})

type Cliente = pg.PoolClient

async function id(c: Cliente, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const valor = rows[0]?.id
  if (!valor) throw new Error(`Sin id para: ${sql}`)
  return valor
}

const crearAutor = (c: Cliente, nombre: string) =>
  id(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [nombre])

const crearMaterial = (c: Cliente, autor: string) =>
  id(
    c,
    `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('documento', $1, 'referente', 'hola', now(), $2) returning id`,
    [autor, CONI],
  )

const crearAfirmacion = (c: Cliente, material: string, autor: string) =>
  id(
    c,
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
     values ($1, $2, 0, '{"pagina": 1}', 't', 'c', 'dato', 'estudio') returning id`,
    [material, autor],
  )

const versionDe = async (c: Cliente, lista: string, red = "todas") => {
  const { rows } = await c.query<{ id: number }>(
    "select id from public.versiones_de_vocabulario where lista = $1 and red = $2 and estado = 'vigente'",
    [lista, red],
  )
  return rows[0]?.id
}

describe("afirmacion_marcas and ganchos", () => {
  it("stores marks and one hook per claim, and drops them with the claim", async () => {
    await como(comoServicio, async (c) => {
      const autor = await crearAutor(c, "Autora marcas")
      const afirmacion = await crearAfirmacion(c, await crearMaterial(c, autor), autor)
      await c.query(
        `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, frase, certeza, version_id, origen)
         values ($1, 'emocion', 'linkedin', 'escepticismo', 'duda', 'alta', $2, 'extraccion')`,
        [afirmacion, await versionDe(c, "emocion")],
      )
      const gancho = `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
         values ($1, $2, 'Muchas no aprendieron a reconocer sus logros.', $3, 'media', $4, 'extraccion')`
      const version = await versionDe(c, "gancho")
      await c.query(gancho, [afirmacion, "¿Y si no eres impostora?", "pregunta_espejo", version])
      const repetido = await fallaCon(c, gancho, [afirmacion, "otra frase", "escena", version])
      expect(repetido.code).toBe("23505")
      expect(repetido.constraint).toBe("ganchos_afirmacion_id_key")
      await c.query("delete from public.afirmaciones where id = $1", [afirmacion])
      const quedan = await c.query<{ n: string }>(
        `select (select count(*) from public.afirmacion_marcas where afirmacion_id = $1)
              + (select count(*) from public.ganchos where afirmacion_id = $1) as n`,
        [afirmacion],
      )
      expect(Number(quedan.rows[0]?.n)).toBe(0)
    })
  })

  it("requires a reason for otro and otra", async () => {
    await como(comoServicio, async (c) => {
      const autor = await crearAutor(c, "Autora otro")
      const afirmacion = await crearAfirmacion(c, await crearMaterial(c, autor), autor)
      const error = await fallaCon(
        c,
        `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, certeza, origen)
         values ($1, 'emocion', 'instagram', 'otra', 'baja', 'extraccion')`,
        [afirmacion],
      )
      expect(error.constraint).toBe("afirmacion_marcas_por_que_check")
    })
  })

  it("lets Coni read marks and hooks and not write them", async () => {
    await como(comoConi, async (c) => {
      await c.query("select id from public.afirmacion_marcas limit 1")
      await c.query("select id from public.ganchos limit 1")
      const error = await fallaCon(
        c,
        `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
         values (gen_random_uuid(), 'a', 'b', 'escena', 'baja', 1, 'extraccion')`,
      )
      expect(error.code).toBe("42501")
    })
  })
})

describe("leerVocabulario", () => {
  it("reads every vigente list with its version", async () => {
    const v = await leerVocabulario(clienteDeServicio())
    expect(v.emocion.todas.valores).toHaveLength(22)
    expect(v.publico.instagram.valores.map((x) => x.valor)).toEqual([
      "profesional_con_techo",
      "se_reinventa",
      "se_descubre_tarde",
    ])
    expect(v.gancho.todas.versionId).toBeGreaterThan(0)
  })
})
