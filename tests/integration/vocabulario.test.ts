import { afterAll, describe, expect, it } from "vitest"
import { EVIDENCIAS_DE_AFIRMACION, TIPOS_DE_AFIRMACION } from "@/lib/proveedores/anthropic"
import { como, comoConi, comoServicio, fallaCon, pool } from "./db"

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
