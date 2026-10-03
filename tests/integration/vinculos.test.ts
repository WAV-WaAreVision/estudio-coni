import { HttpResponse, http } from "msw"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { procesarMaterial } from "@/lib/ingesta/procesar"
import { vincularMaterial } from "@/lib/ingesta/vincular"
import { servidor } from "../msw"
import { como, comoConi, comoMantenedor, comoOtra, comoServicio, fallaCon, pool } from "./db"
import {
  almacenEnMemoria,
  crearMaterial,
  deps,
  gastos,
  limpiar,
  simularClaude,
  TEXTO_CHILENO,
  URL_CLAUDE,
  USO,
} from "./procesar-comun"

afterEach(limpiar)
afterAll(() => pool.end())

const URL_VOYAGE = "https://api.voyageai.com/v1/embeddings"
const COSTO_SONNET = 0.003

/** A vector that points mostly along the first axis; `x` tilts it, so a larger `x` is farther from `vec(0)`. */
const vec = (x: number) => `[${[1, x, ...Array.from({ length: 1022 }, () => 0)].join(",")}]`

async function conFicha(opciones: { x?: number; resumen?: string; ideas?: string[]; citas?: string[] } = {}) {
  const almacen = almacenEnMemoria()
  const id = await crearMaterial(almacen, { tipo: "documento", titulo: "Material", texto_pegado: TEXTO_CHILENO })
  await pool.query(
    "insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente) values ($1, $2, $3, $4, '{}')",
    [
      id,
      opciones.resumen ?? "Resumen del material.",
      JSON.stringify(opciones.ideas ?? ["Idea uno.", "Idea dos."]),
      JSON.stringify((opciones.citas ?? []).map((texto) => ({ texto, ubicacion: { pagina: 1 } }))),
    ],
  )
  if (opciones.x !== undefined) await conVector(id, opciones.x)
  return { almacen, id }
}

async function conVector(id: string, x: number) {
  await pool.query(
    "insert into public.embeddings_ficha (material_id, vector, modelo) values ($1, $2::extensions.vector, 'voyage-3.5')",
    [id, vec(x)],
  )
}

async function nuevoPar(): Promise<[string, string]> {
  const a = await conFicha({ x: 0 })
  const b = await conFicha({ x: 0.1 })
  return a.id < b.id ? [a.id, b.id] : [b.id, a.id]
}

async function insertarVinculo(a: string, b: string, estado = "sugerido") {
  await pool.query(
    "insert into public.vinculos (material_a, material_b, tipo, relevancia, estado, razon) values ($1, $2, 'complementa', 3, $3, 'r')",
    [a, b, estado],
  )
}

interface FilaVinculo {
  material_a: string
  material_b: string
  tipo: string
  relevancia: number
  estado: string
  razon: string | null
  cita_a: string | null
  cita_b: string | null
  decidido_por: string | null
  decidido_en: Date | null
}

async function vinculos(id: string): Promise<FilaVinculo[]> {
  const { rows } = await pool.query<FilaVinculo>(
    "select * from public.vinculos where material_a = $1 or material_b = $1 order by material_a, material_b",
    [id],
  )
  return rows
}

async function pendientes(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ v: boolean }>(
    "select vinculos_pendientes as v from public.materiales where id = $1",
    [id],
  )
  return rows[0]?.v ?? false
}

interface Veredicto {
  id: string
  tipo: string
  relevancia: number
  razon: string
  cita_base: string
  cita_candidata: string
}

interface LlamadasVinculos {
  n: number
  candidatas: string[][]
}

/** Answers every call that carries the link prompt; `responder` decides the verdicts from the ids it was sent. */
function simularVinculos(
  responder: (ids: string[]) => Veredicto[] | Promise<Veredicto[]>,
  estado = 200,
): LlamadasVinculos {
  const llamadas: LlamadasVinculos = { n: 0, candidatas: [] }
  servidor.use(
    http.post<never, { messages: { content: string }[] }>(URL_CLAUDE, async ({ request }) => {
      // Cloned: when this is not a link prompt the request falls through to the next handler, which reads it again.
      const cuerpo = await request.clone().json()
      const texto = cuerpo.messages[0]?.content ?? ""
      if (!texto.includes("<ficha_base>")) return undefined
      llamadas.n += 1
      const candidatas: { id: string }[] = JSON.parse(
        texto.split("<candidatas>\n")[1]?.split("\n</candidatas>")[0] ?? "[]",
      )
      const ids = candidatas.map((c) => c.id)
      llamadas.candidatas.push(ids)
      if (estado !== 200)
        return HttpResponse.json({ error: { type: "api_error", message: "boom" } }, { status: estado })
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: JSON.stringify({ veredictos: await responder(ids) }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return llamadas
}

const veredicto = (id: string, resto: Partial<Veredicto> = {}): Veredicto => ({
  id,
  tipo: "complementa",
  relevancia: 4,
  razon: "Se complementan.",
  cita_base: "Frase de la base.",
  cita_candidata: "Frase de la candidata.",
  ...resto,
})

describe("esquema de vinculos", () => {
  it("rejects a pair out of order, a relevance outside 1 to 5, an unknown tipo or an unknown estado", async () => {
    const [a, b] = await nuevoPar()
    await como(comoServicio, async (c) => {
      const insertar = (x: string, y: string, tipo = "complementa", relevancia = 3, estado = "sugerido") =>
        fallaCon(
          c,
          "insert into public.vinculos (material_a, material_b, tipo, relevancia, estado) values ($1, $2, $3, $4, $5)",
          [x, y, tipo, relevancia, estado],
        )
      expect((await insertar(b, a)).code).toBe("23514")
      expect((await insertar(a, b, "complementa", 0)).code).toBe("23514")
      expect((await insertar(a, b, "complementa", 6)).code).toBe("23514")
      expect((await insertar(a, b, "inventado")).code).toBe("23514")
      expect((await insertar(a, b, "complementa", 3, "otro")).code).toBe("23514")
    })
  })

  it("defaults to sugerido, keeps one row per pair and deletes with either material", async () => {
    const [a, b] = await nuevoPar()
    await insertarVinculo(a, b)
    expect((await vinculos(a))[0]?.estado).toBe("sugerido")
    await como(comoServicio, async (c) => {
      const e = await fallaCon(
        c,
        "insert into public.vinculos (material_a, material_b, tipo, relevancia) values ($1, $2, 'amplia', 2)",
        [a, b],
      )
      expect(e.code).toBe("23505")
    })

    await pool.query("delete from public.materiales where id = $1", [b])

    expect(await vinculos(a)).toEqual([])
  })

  it("lets Coni and the maintainer read, nobody else, and nobody but the service write", async () => {
    const [a, b] = await nuevoPar()
    await insertarVinculo(a, b)

    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        const { rows } = await c.query("select 1 from public.vinculos where material_a = $1", [a])
        expect(rows).toHaveLength(1)
        const e = await fallaCon(c, "update public.vinculos set estado = 'aceptado' where material_a = $1", [a])
        expect(e.code).toBe("42501")
        const i = await fallaCon(
          c,
          "insert into public.vinculos (material_a, material_b, tipo, relevancia) values ($1, $2, 'amplia', 2)",
          [a, b],
        )
        expect(i.code).toBe("42501")
        const d = await fallaCon(c, "delete from public.vinculos where material_a = $1", [a])
        expect(d.code).toBe("42501")
      })
    }
    await como(comoOtra, async (c) => {
      const { rows } = await c.query("select 1 from public.vinculos where material_a = $1", [a])
      expect(rows).toHaveLength(0)
    })
    await como(comoServicio, async (c) => {
      const r = await c.query("update public.vinculos set razon = 'x' where material_a = $1", [a])
      expect(r.rowCount).toBe(1)
    })
  })

  it("records the creation of a link in the audit log", async () => {
    const [a, b] = await nuevoPar()
    await insertarVinculo(a, b)

    const { rows } = await pool.query(
      "select operacion from public.eventos where tabla = 'vinculos' and datos ->> 'material_a' = $1",
      [a],
    )

    expect(rows).toEqual([{ operacion: "insert" }])
  })
})

describe("materiales_cercanos", () => {
  const cercanos = (c: Parameters<Parameters<typeof como>[1]>[0], id: string, limite?: number) =>
    c.query<{ material_id: string; distancia: number }>(
      limite === undefined
        ? "select * from public.materiales_cercanos($1)"
        : "select * from public.materiales_cercanos($1, $2)",
      limite === undefined ? [id] : [id, limite],
    )

  it("returns the nearest first with their cosine distance, never the material itself", async () => {
    const base = await conFicha({ x: 0 })
    const cerca = await conFicha({ x: 0.1 })
    const lejos = await conFicha({ x: 2 })

    await como(comoServicio, async (c) => {
      const { rows } = await cercanos(c, base.id)
      expect(rows.map((r) => r.material_id)).toEqual([cerca.id, lejos.id])
      expect(rows[0]?.distancia).toBeGreaterThan(0)
      expect(rows[0]?.distancia).toBeLessThan(rows[1]?.distancia ?? 0)
    })
  })

  it("honors the limit, which defaults to ten", async () => {
    const base = await conFicha({ x: 0 })
    for (let i = 1; i <= 11; i++) await conFicha({ x: i / 10 })

    await como(comoServicio, async (c) => {
      expect((await cercanos(c, base.id)).rows).toHaveLength(10)
      expect((await cercanos(c, base.id, 3)).rows).toHaveLength(3)
    })
  })

  it("skips the materials without an embedding and returns nothing for a material without one", async () => {
    const base = await conFicha({ x: 0 })
    const sinVector = await conFicha()

    await como(comoServicio, async (c) => {
      expect((await cercanos(c, base.id)).rows).toEqual([])
      expect((await cercanos(c, sinVector.id)).rows).toEqual([])
    })
  })

  it("leaves out every pair that already has a link, whatever its estado", async () => {
    const base = await conFicha({ x: 0 })
    const sugerido = await conFicha({ x: 0.1 })
    const aceptado = await conFicha({ x: 0.2 })
    const descartado = await conFicha({ x: 0.3 })
    const libre = await conFicha({ x: 0.4 })
    for (const [otro, estado] of [
      [sugerido.id, "sugerido"],
      [aceptado.id, "aceptado"],
      [descartado.id, "descartado"],
    ] as const) {
      await insertarVinculo(...([base.id, otro].sort() as [string, string]), estado)
    }

    await como(comoServicio, async (c) => {
      expect((await cercanos(c, base.id)).rows.map((r) => r.material_id)).toEqual([libre.id])
    })
  })

  it("is callable by the service only", async () => {
    const base = await conFicha({ x: 0 })
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        const e = await fallaCon(c, "select * from public.materiales_cercanos($1)", [base.id])
        expect(e.code).toBe("42501")
      })
    }
  })
})

describe("decidir vinculos", () => {
  it("accepts a suggestion whichever order the ids come in and stamps who decided and when", async () => {
    const [a, b] = await nuevoPar()
    await insertarVinculo(a, b)

    await como(comoConi, async (c) => {
      const { rows } = await c.query("select * from public.aceptar_vinculo($1, $2)", [b, a])
      expect(rows[0]).toMatchObject({ material_a: a, material_b: b, estado: "aceptado", tipo: "complementa" })
      expect(rows[0]?.decidido_por).toBe("c0000000-0000-4000-8000-000000000001")
      expect(rows[0]?.decidido_en).toBeInstanceOf(Date)
    })
  })

  it("lets the person adjust the tipo and the relevance when accepting", async () => {
    const [a, b] = await nuevoPar()
    await insertarVinculo(a, b)

    await como(comoMantenedor, async (c) => {
      const { rows } = await c.query("select * from public.aceptar_vinculo($1, $2, 'contradice', 5)", [a, b])
      expect(rows[0]).toMatchObject({ estado: "aceptado", tipo: "contradice", relevancia: 5 })
    })
  })

  it("discards a link and never suggests the pair again", async () => {
    const [a, b] = await nuevoPar()
    await insertarVinculo(a, b)
    await como(comoConi, async (c) => {
      const { rows } = await c.query("select * from public.descartar_vinculo($1, $2)", [b, a])
      expect(rows[0]).toMatchObject({ estado: "descartado" })
      expect(rows[0]?.decidido_por).not.toBeNull()
    })
    await pool.query("update public.vinculos set estado = 'descartado' where material_a = $1", [a])

    await como(comoServicio, async (c) => {
      const { rows } = await c.query("select * from public.materiales_cercanos($1)", [a])
      expect(rows).toEqual([])
    })
    const llamadas = simularVinculos(() => [])
    const r = await vincularMaterial(await deps(almacenEnMemoria()), a)
    expect(r).toBe(true)
    expect(llamadas.n).toBe(0)
  })

  it("refuses to accept a discarded link and a link that does not exist", async () => {
    const [a, b] = await nuevoPar()
    await insertarVinculo(a, b, "descartado")

    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select * from public.aceptar_vinculo($1, $2)", [a, b])).message).toBe(
        "vinculo_descartado",
      )
      const otro = await conFicha()
      expect((await fallaCon(c, "select * from public.aceptar_vinculo($1, $2)", [a, otro.id])).code).toBe("P0002")
    })
  })

  it("creates an accepted link by hand with the pair in order and refuses a pair that already has one", async () => {
    const [a, b] = await nuevoPar()

    await como(comoConi, async (c) => {
      const { rows } = await c.query("select * from public.crear_vinculo($1, $2, 'ejemplo_de', 2, 'Lo ilustra.')", [
        b,
        a,
      ])
      expect(rows[0]).toMatchObject({
        material_a: a,
        material_b: b,
        estado: "aceptado",
        tipo: "ejemplo_de",
        relevancia: 2,
        razon: "Lo ilustra.",
        cita_a: null,
      })
      expect(rows[0]?.decidido_por).not.toBeNull()
      const e = await fallaCon(c, "select * from public.crear_vinculo($1, $2, 'amplia', 3, null)", [a, b])
      expect(e.code).toBe("22023")
      expect(e.message).toBe("vinculo_existente")
    })
  })

  it("refuses a link of a material with itself", async () => {
    const [a] = await nuevoPar()
    await como(comoConi, async (c) => {
      const e = await fallaCon(c, "select * from public.crear_vinculo($1, $1, 'amplia', 3, null)", [a])
      expect(e.code).toBe("22023")
    })
  })

  it("is closed to anyone who is not Coni or the maintainer, and to the service", async () => {
    const [a, b] = await nuevoPar()
    await insertarVinculo(a, b)
    for (const sesion of [comoOtra, comoServicio]) {
      await como(sesion, async (c) => {
        for (const sql of [
          "select * from public.aceptar_vinculo($1, $2)",
          "select * from public.descartar_vinculo($1, $2)",
          "select * from public.crear_vinculo($1, $2, 'amplia', 3, null)",
        ]) {
          expect((await fallaCon(c, sql, [a, b])).code).toBe("42501")
        }
      })
    }
  })
})

describe("vincularMaterial", () => {
  it("makes no call to Claude when there are no candidates, and clears the pending flag", async () => {
    const solo = await conFicha({ x: 0 })
    await pool.query("update public.materiales set vinculos_pendientes = true where id = $1", [solo.id])
    const llamadas = simularVinculos(() => [])

    const r = await vincularMaterial(await deps(solo.almacen), solo.id)

    expect(r).toBe(true)
    expect(llamadas.n).toBe(0)
    expect(await pendientes(solo.id)).toBe(false)
    expect(await gastos(solo.id)).toEqual([])
  })

  it("sends the card and every candidate in one call and stores the links as suggestions, paying the real cost", async () => {
    const base = await conFicha({ x: 0, resumen: "Frase de la base." })
    const c1 = await conFicha({ x: 0.1, resumen: "Frase de la candidata." })
    const c2 = await conFicha({ x: 0.2 })
    const llamadas = simularVinculos((ids) =>
      ids.map((id) =>
        id === c1.id
          ? veredicto(id)
          : veredicto(id, { tipo: "ninguno", relevancia: 1, cita_base: "", cita_candidata: "" }),
      ),
    )

    const r = await vincularMaterial(await deps(base.almacen), base.id)

    expect(r).toBe(true)
    expect(llamadas.n).toBe(1)
    expect(llamadas.candidatas[0]?.sort()).toEqual([c1.id, c2.id].sort())
    const filas = await vinculos(base.id)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      tipo: "complementa",
      relevancia: 4,
      estado: "sugerido",
      razon: "Se complementan.",
      decidido_por: null,
    })
    expect(await pendientes(base.id)).toBe(false)
    expect(await gastos(base.id)).toEqual([
      { proveedor: "anthropic", paso: "vinculos", estado: "confirmado", real: COSTO_SONNET },
    ])
  })

  it("puts the quotes with the material they belong to, whichever of the two ids is smaller", async () => {
    const base = await conFicha({ x: 0, resumen: "Frase de la base." })
    const otra = await conFicha({ x: 0.1, resumen: "Frase de la candidata." })
    simularVinculos((ids) => ids.map((id) => veredicto(id)))

    await vincularMaterial(await deps(base.almacen), base.id)

    const [fila] = await vinculos(base.id)
    expect(fila?.material_a).toBe(base.id < otra.id ? base.id : otra.id)
    const citaDeBase = base.id < otra.id ? fila?.cita_a : fila?.cita_b
    const citaDeOtra = base.id < otra.id ? fila?.cita_b : fila?.cita_a
    expect(citaDeBase).toBe("Frase de la base.")
    expect(citaDeOtra).toBe("Frase de la candidata.")
  })

  it("drops the links whose quotes are not in the cards", async () => {
    const base = await conFicha({ x: 0, resumen: "Frase de la base." })
    await conFicha({ x: 0.1, resumen: "Frase de la candidata." })
    simularVinculos((ids) => ids.map((id) => veredicto(id, { cita_candidata: "Algo que la ficha no dice." })))

    const r = await vincularMaterial(await deps(base.almacen), base.id)

    expect(r).toBe(true)
    expect(await vinculos(base.id)).toEqual([])
    expect(await pendientes(base.id)).toBe(false)
  })

  it("never overwrites a pair that was decided while Claude was thinking", async () => {
    const base = await conFicha({ x: 0, resumen: "Frase de la base." })
    const otra = await conFicha({ x: 0.1, resumen: "Frase de la candidata." })
    simularVinculos(async (ids) => {
      await insertarVinculo(...([base.id, otra.id].sort() as [string, string]), "aceptado")
      return ids.map((id) => veredicto(id, { tipo: "contradice", relevancia: 1 }))
    })

    await vincularMaterial(await deps(base.almacen), base.id)

    const filas = await vinculos(base.id)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ estado: "aceptado", tipo: "complementa", relevancia: 3 })
  })

  it("flags the material as pending, releases the reservation and does not throw when Claude fails", async () => {
    const base = await conFicha({ x: 0 })
    await conFicha({ x: 0.1 })
    simularVinculos(() => [], 500)

    const r = await vincularMaterial(await deps(base.almacen), base.id)

    expect(r).toBe(false)
    expect(await pendientes(base.id)).toBe(true)
    expect((await gastos(base.id)).map((g) => g.estado)).toEqual(["liberado"])
    expect(await vinculos(base.id)).toEqual([])
  })

  it("leaves the material pending, calling nothing, when it has no embedding", async () => {
    const base = await conFicha()
    await conFicha({ x: 0.1 })
    const llamadas = simularVinculos(() => [])

    const r = await vincularMaterial(await deps(base.almacen), base.id)

    expect(r).toBe(false)
    expect(llamadas.n).toBe(0)
    expect(await pendientes(base.id)).toBe(true)
  })
})

describe("vinculos al procesar un material", () => {
  const vector = (valor: number) => Array.from({ length: 1024 }, () => valor)
  function simularVoyage() {
    servidor.use(
      http.post(URL_VOYAGE, async ({ request }) => {
        const cuerpo = (await request.json()) as { input: string[] }
        return HttpResponse.json({
          data: cuerpo.input.map((_, index) => ({ embedding: vector(0.5), index })),
          usage: { total_tokens: 1000 },
        })
      }),
    )
  }
  const conLlave = { llaveVoyage: () => "pa-de-prueba" }

  it("suggests links right after the embedding and does not classify again when the material runs again", async () => {
    const vecino = await conFicha({ x: 0, resumen: "Frase de la candidata." })
    const almacen = almacenEnMemoria()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    simularClaude()
    simularVoyage()
    const llamadas = simularVinculos((ids) => ids.map((c) => veredicto(c, { cita_base: "Un resumen de la fuente." })))

    const r = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(r).toEqual({ resultado: "listo" })
    expect(llamadas.n).toBe(1)
    expect(llamadas.candidatas[0]).toEqual([vecino.id])
    expect(await vinculos(id)).toHaveLength(1)
    expect(await pendientes(id)).toBe(false)
    expect((await gastos(id)).filter((g) => g.paso === "vinculos")).toHaveLength(1)

    await pool.query("update public.materiales set estado = 'procesando' where id = $1", [id])
    await procesarMaterial(await deps(almacen, conLlave), id)
    expect(llamadas.n).toBe(1)
    expect((await gastos(id)).filter((g) => g.paso === "vinculos")).toHaveLength(1)
  })

  it("keeps the material ready and pending when Claude fails to classify", async () => {
    await conFicha({ x: 0 })
    const almacen = almacenEnMemoria()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    simularClaude()
    simularVoyage()
    simularVinculos(() => [], 500)

    const r = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(r).toEqual({ resultado: "listo" })
    expect(await pendientes(id)).toBe(true)
  })
})
