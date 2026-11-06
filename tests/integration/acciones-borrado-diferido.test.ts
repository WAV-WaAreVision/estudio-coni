import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  confirmarMaterial,
  crearAutor,
  editarMaterial,
  pedirTextoOriginal,
  unirAutores,
} from "@/lib/acciones/biblioteca"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
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
