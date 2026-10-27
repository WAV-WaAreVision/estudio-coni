import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { claveProducir } from "@/lib/acciones/disparos"
import {
  aprobarGuion,
  type DepsAcciones,
  firmarCarrusel,
  hacerCarrusel,
  pedirCambioDeCarrusel,
  pedirCambios,
  pedirVoz,
  reintentarGuion,
} from "@/lib/acciones/piezas"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import type { Database } from "@/lib/supabase/database.types"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, leerFila, sembrarCarrusel, sembrarIdea } from "./siembra"

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

const HASH = hashTextoDeCarrusel({ laminas: LAMINAS_DE_PRUEBA, textoPost: TEXTO_POST_DE_PRUEBA })
const BLOQUEA = [
  {
    regla: "mencion_avatar",
    tipo: "bloquea",
    mensaje: "El carrusel lo firmas tú y no lleva avatar: quita la mención de la lámina.",
    frase: "avatar",
  },
]

async function carrusel(destino: Parameters<typeof sembrarCarrusel>[0] = "guion_por_aprobar", revision: unknown = []) {
  const id = await sembrarCarrusel(destino, { revision })
  piezasCreadas.push(id)
  return id
}
const versionDe = async (id: string) => (await leerFila(id)).version

describe("firmarCarrusel", () => {
  it("signs the latest version's text without an avatar and starts nothing (part 1 stops here)", async () => {
    const id = await carrusel()
    const { deps, disparos } = armar()
    const vista = await versionDe(id)

    expect(await firmarCarrusel(deps, id, vista)).toEqual({ ok: true, version: vista + 1 })

    expect(await leerFila(id)).toMatchObject({
      estado: "armando_carrusel",
      puerta1_hash: HASH,
      puerta1_por: CONI,
      avatar_id: null,
      puerta1_formula: null,
    })
    expect(disparos).toEqual([])
  })

  it("refuses a screen that is out of date", async () => {
    const id = await carrusel()
    expect(await firmarCarrusel(armar().deps, id, (await versionDe(id)) - 1)).toEqual({
      ok: false,
      error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    })
    expect((await leerFila(id)).estado).toBe("guion_por_aprobar")
  })

  it("refuses while the review blocks", async () => {
    const id = await carrusel("guion_por_aprobar", BLOQUEA)
    const resultado = await firmarCarrusel(armar().deps, id, await versionDe(id))
    expect(resultado).toEqual({ ok: false, error: `Todavía no puedes aprobar. ${BLOQUEA[0]?.mensaje}` })
  })
})

describe("pedirCambioDeCarrusel", () => {
  it("sends it back with her sentence and starts the new text as a new round", async () => {
    const id = await carrusel()
    const { deps, disparos } = armar()

    expect(await pedirCambioDeCarrusel(deps, id, await versionDe(id), "  Más corto, con un ejemplo  ")).toEqual({
      ok: true,
    })

    const fila = await leerFila(id)
    expect(fila).toMatchObject({
      estado: "guion_en_proceso",
      pedido_de_cambio: "Más corto, con un ejemplo",
      intento: 1,
    })
    expect(disparos).toEqual([{ tarea: "producir", piezaId: id, clave: claveProducir(fila) }])
  })

  it("asks for a sentence when there is none", async () => {
    const id = await carrusel()
    expect(await pedirCambioDeCarrusel(armar().deps, id, await versionDe(id), "   ")).toEqual({
      ok: false,
      error: "Escribe en una frase qué quieres cambiar.",
    })
  })

  it("stops after three changes and keeps the carousel where it is", async () => {
    const id = await carrusel()
    for (let v = 2; v <= 4; v++) {
      await pool.query(
        "insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, pedido) values ($1, $2, $3::jsonb, 'T', $4, 'cambio_texto', 'x')",
        [id, v, JSON.stringify(LAMINAS_DE_PRUEBA), HASH],
      )
    }
    // Her three requests, as pedir_cambio_de_carrusel counts them.
    await pool.query("update public.piezas set cambios_de_texto = 3, version = version + 1 where id = $1", [id])
    const { deps, disparos } = armar()
    expect(await pedirCambioDeCarrusel(deps, id, await versionDe(id), "Uno más")).toEqual({
      ok: false,
      error: "Ya pediste 3 cambios. Puedes firmarlo como está.",
    })
    expect((await leerFila(id)).estado).toBe("guion_por_aprobar")
    expect(disparos).toEqual([])
  })
})

describe("the reel's gate 1 actions on a carousel", () => {
  it("refuse it and leave it untouched", async () => {
    const id = await carrusel()
    const { deps, disparos } = armar()
    const vista = await versionDe(id)
    for (const resultado of [
      await aprobarGuion(deps, id, vista, "look-a"),
      await pedirCambios(deps, id, vista),
      await pedirVoz(deps, id, vista, false),
    ]) {
      expect(resultado).toEqual({ ok: false, error: "Esta pieza cambió mientras la mirabas. Vuelve a abrirla." })
    }
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", version: vista })
    expect(disparos).toEqual([])
  })
})

describe("reintentarGuion on a carousel", () => {
  it("words a run slow to start as the carousel's", async () => {
    const id = await sembrarCarrusel("guion_en_proceso")
    piezasCreadas.push(id)
    await pool.query("update public.piezas set explicacion = 'No pude.', version = version + 1 where id = $1", [id])
    const { deps } = armar({ producir: new Error("Trigger caído") })
    const { version } = await leerFila(id)

    expect(await reintentarGuion(deps, id, version)).toMatchObject({
      ok: true,
      advertencia: "Lo intenté otra vez, pero el carrusel tarda en partir. Si no avanza, vuelve a intentarlo.",
    })
  })
})
