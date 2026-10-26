import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { claveProducir } from "@/lib/acciones/disparos"
import { type DepsAcciones, hacerCarrusel } from "@/lib/acciones/piezas"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, leerFila, sembrarIdea } from "./siembra"

type Db = SupabaseClient<Database>
let coni: Db
const piezasCreadas: string[] = []
const ideasCreadas: string[] = []

interface Disparo {
  tarea: "producir" | "grabar" | "voz"
  piezaId: string
  clave: string
}

function armar(fallos: { producir?: Error } = {}) {
  const disparos: Disparo[] = []
  const deps: DepsAcciones = {
    db: coni,
    disparar: {
      async producir(piezaId, clave) {
        if (fallos.producir) throw fallos.producir
        disparos.push({ tarea: "producir", piezaId, clave })
      },
      async grabar(piezaId, clave) {
        disparos.push({ tarea: "grabar", piezaId, clave })
      },
      async voz(piezaId, clave) {
        disparos.push({ tarea: "voz", piezaId, clave })
      },
    },
    ahora: () => new Date().toISOString(),
  }
  return { deps, disparos }
}

async function idea(gancho = "Lo que un chatbot no ve de ti"): Promise<string> {
  const id = await sembrarIdea({ pilar: "ia-salud-mental", gancho })
  ideasCreadas.push(id)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
})

afterAll(async () => {
  await borrarSembrado(piezasCreadas, ideasCreadas)
  await pool.end()
})

describe("hacerCarrusel", () => {
  it("claims the idea, creates its LinkedIn carousel and starts writing it", async () => {
    const ideaId = await idea()
    const { deps, disparos } = armar()

    const resultado = await hacerCarrusel(deps, ideaId)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    piezasCreadas.push(resultado.piezaId)
    const fila = await leerFila(resultado.piezaId)
    expect(fila).toMatchObject({
      tipo: "carrusel",
      destinos: ["linkedin"],
      estado: "guion_en_proceso",
      titulo: "Lo que un chatbot no ve de ti",
      idea_id: ideaId,
    })
    expect((await pool.query("select estado from public.ideas where id = $1", [ideaId])).rows[0]).toEqual({
      estado: "usada",
    })
    expect(disparos).toEqual([{ tarea: "producir", piezaId: resultado.piezaId, clave: claveProducir(fila) }])
  })

  it("says so and starts nothing when the idea is no longer in the bank", async () => {
    const ideaId = await idea()
    await pool.query("update public.ideas set estado = 'usada' where id = $1", [ideaId])
    const { deps, disparos } = armar()

    expect(await hacerCarrusel(deps, ideaId)).toEqual({
      ok: false,
      error: "Una de esas ideas ya no está disponible. Vuelve a elegir.",
    })
    expect(disparos).toEqual([])
  })

  it("leaves the carousel with its reason when writing does not start", async () => {
    const ideaId = await idea()
    const { deps } = armar({ producir: new Error("Trigger caído") })

    expect(await hacerCarrusel(deps, ideaId)).toEqual({
      ok: false,
      error: "No pude empezar a escribir el carrusel. Inténtalo de nuevo en unos minutos.",
    })
    const { rows } = await pool.query("select id, tipo, explicacion from public.piezas where idea_id = $1", [ideaId])
    piezasCreadas.push(...rows.map((r) => r.id))
    expect(rows).toMatchObject([
      { tipo: "carrusel", explicacion: "No pude empezar a escribir el carrusel. Inténtalo de nuevo." },
    ])
  })
})
