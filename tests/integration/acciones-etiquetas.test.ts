import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { confirmarEtiqueta, corregirEtiqueta, quitarMarca } from "@/lib/acciones/etiquetas"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const SOLO_CONI = "Esta app es solo para Coni."
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: Db
let wav: Db
let autora = ""
let material = ""
let nueva = ""
let antigua = ""
let emocion = ""
let problema = ""

async function idea(texto: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
     values ($1, $2, 0, '{"pagina":1}'::jsonb, $3, 'cita', 'dato', 'estudio') returning id`,
    [material, autora, texto],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó la idea ${texto}`)
  return id
}

async function marca(marca: string, red: string, valor: string, lista: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, certeza, version_id, origen)
     select $1, $2, $3, $4, 'media', v.id, 'extraccion' from public.versiones_de_vocabulario v
      where v.lista = $5 and v.estado = 'vigente' and v.red = case when $5 in ('publico', 'dolor') then $3 else 'todas' end
     returning id`,
    [nueva, marca, red, valor, lista],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó la marca ${marca}`)
  return id
}

const valorDe = async (id: string) =>
  (
    await pool.query<{ valor: string; certeza: string }>(
      "select valor, certeza from public.afirmacion_marcas where id = $1",
      [id],
    )
  ).rows[0]

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  autora = await sembrarAutor(`Autora acciones etiquetas ${SUFIJO}`)
  material = await sembrarMaterial({ titulo: `Material acciones etiquetas ${SUFIJO}`, autorId: autora })
  nueva = await idea("Nueva")
  antigua = await idea("Antigua")
  emocion = await marca("emocion", "instagram", "curiosidad", "emocion")
  problema = await marca("problema", "linkedin", "rrhh_tarde", "dolor")
  await pool.query(
    `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
     select $1, 'Nadie te lo dijo.', 'Hay algo que no se dice.', 'escena', 'media', id, 'extraccion'
       from public.versiones_de_vocabulario where lista = 'gancho' and estado = 'vigente'`,
    [nueva],
  )
})

afterAll(async () => {
  await borrarSembrado([material], [], [autora])
  await pool.end()
})

const correccion = (
  extra: Partial<Parameters<typeof corregirEtiqueta>[1]> = {},
): Parameters<typeof corregirEtiqueta>[1] => ({
  afirmacionId: nueva,
  campo: "emocion",
  red: "instagram",
  valor: "sorpresa",
  frase: "",
  porQue: "",
  marcaId: emocion,
  ...extra,
})

describe("corregirEtiqueta", () => {
  it("corrects an emotion to another value", async () => {
    expect(await corregirEtiqueta({ db: coni }, correccion())).toEqual({ ok: true })
    expect(await valorDe(emocion)).toEqual({ valor: "sorpresa", certeza: "alta" })
  })

  it("says Coni's refusals in her words", async () => {
    expect(await corregirEtiqueta({ db: coni }, correccion({ valor: "otra" }))).toEqual({
      ok: false,
      error: "Escribe en una línea por qué.",
    })
    expect(await corregirEtiqueta({ db: coni }, correccion({ afirmacionId: antigua, marcaId: null }))).toEqual({
      ok: false,
      error: "Las marcas de esta idea llegan al reprocesar la Biblioteca.",
    })
    expect(
      await corregirEtiqueta(
        { db: coni },
        correccion({ afirmacionId: AUSENTE, campo: "tipo", red: "todas", valor: "mito", marcaId: null }),
      ),
    ).toEqual({ ok: false, error: "Esa idea ya no está en la Biblioteca." })
  })

  it("refuses WAV's session", async () => {
    expect(await corregirEtiqueta({ db: wav }, correccion({ valor: "calma" }))).toEqual({ ok: false, error: SOLO_CONI })
    expect((await valorDe(emocion))?.valor).not.toBe("calma")
  })
})

describe("confirmarEtiqueta", () => {
  it("confirms the hook type", async () => {
    expect(
      await confirmarEtiqueta(
        { db: coni },
        { afirmacionId: nueva, campo: "tipo_de_gancho", red: "todas", marcaId: null },
      ),
    ).toEqual({ ok: true })
    const { rows } = await pool.query("select certeza, origen from public.ganchos where afirmacion_id = $1", [nueva])
    expect(rows).toEqual([{ certeza: "alta", origen: "coni" }])
  })

  it("says a claim without a hook has none", async () => {
    expect(
      await confirmarEtiqueta(
        { db: coni },
        { afirmacionId: antigua, campo: "tipo_de_gancho", red: "todas", marcaId: null },
      ),
    ).toEqual({ ok: false, error: "Esta idea no tiene gancho." })
  })
})

describe("quitarMarca", () => {
  it("removes a mark, and says it is gone the second time", async () => {
    const quitar = { afirmacionId: nueva, marca: "problema" as const, red: "linkedin" as const, marcaId: problema }
    expect(await quitarMarca({ db: coni }, quitar)).toEqual({ ok: true })
    expect(await valorDe(problema)).toBeUndefined()
    expect(await quitarMarca({ db: coni }, quitar)).toEqual({
      ok: false,
      error: "Esa marca ya no está. Recarga la página.",
    })
  })
})
