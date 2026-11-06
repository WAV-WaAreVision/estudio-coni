import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import {
  borrarAutor,
  borrarMaterial,
  confirmarMaterial,
  crearAutor,
  editarMaterial,
  pedirTextoOriginal,
  recuperarAutor,
  recuperarMaterial,
  unirAutores,
} from "@/lib/acciones/biblioteca"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const NO_ENCONTRE = "No encontré ese material."
const AUTOR_INEXISTENTE = "Ese autor ya no existe."

let coni: Db
let autora = ""
let otra = ""
const materiales: string[] = []
const autores: string[] = []
const almacen = almacenEnMemoria()

const marcar = (tabla: "materiales" | "autores", id: string) =>
  pool.query(`update public.${tabla} set borrar_desde = now() where id = $1`, [id])

async function material(extra: { estado?: "procesando" | "listo" } = {}): Promise<string> {
  const id = await sembrarMaterial({ titulo: `Acción borrable ${SUFIJO}`, autorId: autora, ...extra })
  materiales.push(id)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
  autora = await sembrarAutor(`Autora de acciones ${SUFIJO}`)
  otra = await sembrarAutor(`Otra de acciones ${SUFIJO}`)
  autores.push(autora, otra)
})

afterAll(async () => {
  await borrarSembrado(materiales, [], autores)
  await pool.end()
})

describe("actions on a marked material", () => {
  it("editarMaterial answers not found and changes nothing", async () => {
    const id = await material()
    await marcar("materiales", id)
    const deps = { db: coni, disparar: { material: async () => {} }, nuevoId: randomUUID, almacen }
    const edicion = { materialId: id, autorId: otra, rol: "evidencia" as const }
    expect(await editarMaterial(deps, edicion)).toEqual({ ok: false, error: NO_ENCONTRE })
    const { rows } = await pool.query("select autor_id from public.materiales where id = $1", [id])
    expect(rows[0]?.autor_id).toBe(autora)
  })

  it("pedirTextoOriginal signs nothing", async () => {
    const id = await material()
    await almacen.subir(`materiales/${id}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    await marcar("materiales", id)
    expect(await pedirTextoOriginal({ db: coni, almacen }, id)).toEqual({ ok: false, error: NO_ENCONTRE })
  })

  it("confirmarMaterial answers not found and starts nothing", async () => {
    // Seeded as uploaded by Coni (`sembrarMaterial`), so only the mark can hide it from her.
    const id = await material({ estado: "procesando" })
    await marcar("materiales", id)
    const disparados: string[] = []
    const resultado = await confirmarMaterial(
      {
        db: coni,
        almacen,
        disparar: { material: async (materialId) => void disparados.push(materialId) },
        nuevoId: randomUUID,
        ahora: () => new Date(),
      },
      id,
    )
    expect(resultado).toEqual({ ok: false, error: NO_ENCONTRE })
    expect(disparados).toEqual([])
  })
})

describe("actions on a marked author", () => {
  it("unirAutores refuses a marked origin and a marked destination", async () => {
    const origen = await sembrarAutor(`Origen marcado ${SUFIJO}`)
    const destino = await sembrarAutor(`Destino marcado ${SUFIJO}`)
    autores.push(origen, destino)
    await marcar("autores", origen)
    expect(await unirAutores({ db: coni }, { origen, destino: otra })).toEqual({ ok: false, error: AUTOR_INEXISTENTE })
    await marcar("autores", destino)
    expect(await unirAutores({ db: coni }, { origen: otra, destino })).toEqual({ ok: false, error: AUTOR_INEXISTENTE })
  })

  it("crearAutor with the name of an author she just deleted brings that author back (plan D5)", async () => {
    const nombre = `Vuelve ${SUFIJO}`
    const id = await sembrarAutor(nombre)
    autores.push(id)
    await marcar("autores", id)
    const resultado = await crearAutor({ db: coni }, { nombre, credencial: "", tipo: "persona" })
    expect(resultado).toMatchObject({ ok: true, autor: { id, nombre } })
    const { rows } = await pool.query("select borrar_desde from public.autores where id = $1", [id])
    expect(rows[0]?.borrar_desde).toBeNull()
  })
})

const YA_NO_SE_RECUPERA = "Ya no se puede recuperar: se borró del todo."
const marcaDe = async (tabla: "materiales" | "autores", id: string) =>
  (
    await pool.query<{ marcado: boolean }>(
      `select borrar_desde is not null as marcado from public.${tabla} where id = $1`,
      [id],
    )
  ).rows[0]?.marcado

describe("borrarMaterial and recuperarMaterial", () => {
  it("marks the material and answers the list with the note; Deshacer unmarks it", async () => {
    const id = await material()
    expect(await borrarMaterial({ db: coni }, id)).toEqual({ ok: true, destino: `/biblioteca?aviso=borrado&id=${id}` })
    expect(await marcaDe("materiales", id)).toBe(true)
    expect(await recuperarMaterial({ db: coni }, id)).toEqual({ ok: true })
    expect(await marcaDe("materiales", id)).toBe(false)
  })

  it("lets a second tap on either through: the row is already where she wants it (plan D4)", async () => {
    const id = await material()
    await borrarMaterial({ db: coni }, id)
    expect(await borrarMaterial({ db: coni }, id)).toEqual({ ok: true, destino: `/biblioteca?aviso=borrado&id=${id}` })
    await recuperarMaterial({ db: coni }, id)
    expect(await recuperarMaterial({ db: coni }, id)).toEqual({ ok: true })
  })

  it("says it can no longer be recovered once maintenance deleted it, and not found for a missing one", async () => {
    const id = await material()
    await borrarMaterial({ db: coni }, id)
    await pool.query("delete from public.materiales where id = $1", [id])
    expect(await recuperarMaterial({ db: coni }, id)).toEqual({ ok: false, error: YA_NO_SE_RECUPERA })
    expect(await borrarMaterial({ db: coni }, id)).toEqual({ ok: false, error: NO_ENCONTRE })
  })

  it("lets only Coni do it from Conidolly", async () => {
    const wav = await clienteDelMantenedor()
    const id = await material()
    expect(await borrarMaterial({ db: wav }, id)).toEqual({ ok: false, error: "Esta app es solo para Coni." })
    expect(await marcaDe("materiales", id)).toBe(false)
  })

  it("answers in her words, and logs for WAV, an error she cannot act on", async () => {
    // The server wrapper's Zod refuses a malformed id; called directly, Postgres answers 22P02, an unexpected code.
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(await borrarMaterial({ db: coni }, "no-es-un-uuid")).toEqual({
      ok: false,
      error: "No pude borrarlo. Prueba de nuevo.",
    })
    expect(await recuperarMaterial({ db: coni }, "no-es-un-uuid")).toEqual({
      ok: false,
      error: "No pude recuperarlo. Prueba de nuevo.",
    })
    expect(registro).toHaveBeenCalledWith(expect.stringContaining("no-es-un-uuid"), expect.anything())
    registro.mockRestore()
  })
})

describe("borrarAutor and recuperarAutor", () => {
  it("marks an author with nothing live, answers Autores with the note, and Deshacer unmarks it", async () => {
    const id = await sembrarAutor(`Borrable ${SUFIJO}`)
    autores.push(id)
    expect(await borrarAutor({ db: coni }, id)).toEqual({
      ok: true,
      destino: `/biblioteca/autores?aviso=borrado&id=${id}`,
    })
    expect(await marcaDe("autores", id)).toBe(true)
    expect(await recuperarAutor({ db: coni }, id)).toEqual({ ok: true })
    expect(await marcaDe("autores", id)).toBe(false)
  })

  it("refuses an author that still has materials, and Coni's own card, in her words", async () => {
    // Its own live material, so the test does not lean on what earlier tests left behind.
    await material()
    expect(await borrarAutor({ db: coni }, autora)).toEqual({
      ok: false,
      error: "Este autor todavía tiene materiales.",
    })
    const { rows } = await pool.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
    expect(await borrarAutor({ db: coni }, rows[0]?.id ?? "")).toEqual({
      ok: false,
      error: "Tu propia ficha no se puede borrar.",
    })
  })

  it("says it can no longer be recovered once maintenance deleted it, and that a missing author no longer exists", async () => {
    const id = await sembrarAutor(`Se va ${SUFIJO}`)
    await borrarAutor({ db: coni }, id)
    await pool.query("delete from public.autores where id = $1", [id])
    expect(await recuperarAutor({ db: coni }, id)).toEqual({ ok: false, error: YA_NO_SE_RECUPERA })
    expect(await borrarAutor({ db: coni }, id)).toEqual({ ok: false, error: AUTOR_INEXISTENTE })
  })
})
