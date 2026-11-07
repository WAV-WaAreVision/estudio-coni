import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import * as accionesDeBiblioteca from "@/lib/acciones/biblioteca"
import {
  crearAutor,
  type DepsBiblioteca,
  editarFicha,
  editarMaterial,
  pedirTextoOriginal,
  reintentarMaterial,
  reprocesarMaterial,
} from "@/lib/acciones/biblioteca"
import { claveProcesarMaterial } from "@/lib/acciones/disparos"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import {
  borrarSembrado,
  type MaterialDePrueba,
  sembrarAutor,
  sembrarFicha,
  sembrarMaterial,
} from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const SOLO_CONI = "Esta app es solo para Coni."
const IDEAS = ["Una", "Dos", "Tres", "Cuatro", "Cinco"]

let coni: Db
let wav: Db
let autor = ""
let otroAutor = ""
const materiales: string[] = []
const autores: string[] = []
const disparos: { materialId: string; intento: string | undefined }[] = []
const almacen = almacenEnMemoria()
let siguiente = 0

function deps(db: Db, fallo?: Error): DepsBiblioteca {
  return {
    db,
    disparar: {
      async material(materialId, intento) {
        if (fallo) throw fallo
        disparos.push({ materialId, intento })
      },
    },
    nuevoId: () => `intento-${++siguiente}`,
    almacen,
  }
}

async function material(extra: Partial<MaterialDePrueba> = {}): Promise<string> {
  const id = await sembrarMaterial({ titulo: `Acción ${SUFIJO}`, autorId: autor, ...extra })
  materiales.push(id)
  return id
}

async function fila(id: string) {
  const { rows } = await pool.query("select estado, motivo_fallo, rol, autor_id from public.materiales where id = $1", [
    id,
  ])
  return rows[0]
}

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  autor = await sembrarAutor(`Autora ${SUFIJO}`)
  otroAutor = await sembrarAutor(`Otra autora ${SUFIJO}`)
  autores.push(autor, otroAutor)
})

beforeEach(() => {
  disparos.length = 0
})

afterAll(async () => {
  await pool.query("delete from public.autores where nombre = $1", [`Nueva ${SUFIJO}`])
  await borrarSembrado(materiales, [], autores)
  await pool.end()
})

describe("reintentarMaterial", () => {
  it("puts a failed material back to processing and starts a run under a new attempt", async () => {
    const id = await material({ estado: "fallido", motivo: "sin_texto" })

    expect(await reintentarMaterial(deps(coni), id)).toEqual({ ok: true })

    expect(await fila(id)).toMatchObject({ estado: "procesando", motivo_fallo: null })
    expect(disparos).toEqual([{ materialId: id, intento: `intento-${siguiente}` }])
  })

  it("starts two runs with two keys when she retries twice", async () => {
    const id = await material({ estado: "fallido", motivo: "sin_texto" })
    await reintentarMaterial(deps(coni), id)
    await pool.query("update public.materiales set estado = 'fallido', motivo_fallo = 'sin_texto' where id = $1", [id])
    await reintentarMaterial(deps(coni), id)

    const claves = disparos.map((d) => claveProcesarMaterial(d.materialId, d.intento))
    expect(claves).toHaveLength(2)
    expect(new Set(claves).size).toBe(2)
  })

  it("says a ready material cannot be retried, and starts nothing", async () => {
    const id = await material({ estado: "listo" })
    expect(await reintentarMaterial(deps(coni), id)).toEqual({
      ok: false,
      error: "Ese material ya no se puede reintentar.",
    })
    expect(disparos).toEqual([])
  })

  it("leaves the material retryable and tells her when the run cannot start", async () => {
    const id = await material({ estado: "fallido", motivo: "sin_texto" })
    expect(await reintentarMaterial(deps(coni, new Error("Trigger caído")), id)).toEqual({
      ok: false,
      error: "No pude iniciar el procesamiento. Toca Reintentar en un rato.",
    })
    expect(await fila(id)).toMatchObject({
      estado: "procesando",
      motivo_fallo: "No pude iniciar el procesamiento. Reintenta.",
    })
  })
})

describe("reprocesarMaterial, and no cost confirmation (batch 6)", () => {
  it("sends a ready material through the whole process again under a new attempt", async () => {
    const id = await material({ estado: "listo" })
    expect(await reprocesarMaterial(deps(coni), id)).toEqual({ ok: true })
    expect((await fila(id))?.estado).toBe("procesando")
    expect(disparos).toEqual([{ materialId: id, intento: `intento-${siguiente}` }])
  })

  it("says a material still processing cannot be reprocessed now", async () => {
    const id = await material({ estado: "procesando" })
    expect(await reprocesarMaterial(deps(coni), id)).toEqual({
      ok: false,
      error: "Ese material no se puede reprocesar ahora.",
    })
  })

  it("picks up with Reintentar a material the old cost gate left paused, never asking to confirm it (D6)", async () => {
    const id = await material({ estado: "procesando", costo: 1.2, motivo: "Este material es largo." })
    expect(await reintentarMaterial(deps(coni), id)).toEqual({ ok: true })
    expect(await fila(id)).toMatchObject({ estado: "procesando", motivo_fallo: null })
    expect(disparos.map((d) => d.materialId)).toEqual([id])
  })

  it("has no action to confirm a cost any more", () => {
    expect(Object.keys(accionesDeBiblioteca)).not.toContain("confirmarCosto")
  })
})

describe("editarMaterial and editarFicha", () => {
  it("changes who a material is by and who it is for her", async () => {
    const id = await material()
    expect(await editarMaterial(deps(coni), { materialId: id, autorId: otroAutor, rol: "evidencia" })).toEqual({
      ok: true,
    })
    expect(await fila(id)).toMatchObject({ autor_id: otroAutor, rol: "evidencia" })
  })

  it("says so when the author was deleted meanwhile, or the material is not there", async () => {
    const id = await material()
    expect(await editarMaterial(deps(coni), { materialId: id, autorId: randomUUID(), rol: "referente" })).toEqual({
      ok: false,
      error: "Ese autor ya no existe. Elígelo de nuevo.",
    })
    expect(await editarMaterial(deps(coni), { materialId: randomUUID(), autorId: autor, rol: "referente" })).toEqual({
      ok: false,
      error: "No encontré ese material.",
    })
  })

  it("saves the four fields of a card and refuses fewer than five key ideas", async () => {
    const id = await material({ rol: "estrategia" })
    await sembrarFicha(id, IDEAS)
    const edicion = {
      materialId: id,
      resumen: "Otro resumen",
      ideasClave: [...IDEAS, "Seis"],
      citas: [],
      fuente: { autor: "Gottman", anio: 2015, enlace: null },
    }

    expect(await editarFicha(deps(coni), edicion)).toEqual({ ok: true })
    const { rows } = await pool.query("select resumen, ideas_clave from public.fichas where material_id = $1", [id])
    expect(rows[0]).toEqual({ resumen: "Otro resumen", ideas_clave: [...IDEAS, "Seis"] })

    expect(await editarFicha(deps(coni), { ...edicion, ideasClave: ["Una"] })).toEqual({
      ok: false,
      error: "Deja entre 5 y 10 ideas clave.",
    })
  })
})

describe("crearAutor", () => {
  it("adds an author, and answers the existing one for the same name", async () => {
    const primero = await crearAutor(deps(coni), { nombre: `Nueva ${SUFIJO}`, credencial: "Sexóloga", tipo: "persona" })
    const segundo = await crearAutor(deps(coni), { nombre: ` nueva ${SUFIJO} `, credencial: "", tipo: "persona" })
    expect(primero).toMatchObject({ ok: true, autor: { nombre: `Nueva ${SUFIJO}`, credencial: "Sexóloga" } })
    expect(segundo.ok && primero.ok && segundo.autor.id === primero.autor.id).toBe(true)
  })

  it("asks for a name", async () => {
    expect(await crearAutor(deps(coni), { nombre: "  ", credencial: "", tipo: "persona" })).toEqual({
      ok: false,
      error: "Escribe el nombre del autor.",
    })
  })
})

describe("pedirTextoOriginal", () => {
  it("signs the original text for five minutes, or says it is not there yet", async () => {
    const id = await material()
    expect(await pedirTextoOriginal(deps(coni), id)).toEqual({
      ok: false,
      error: "Ese texto todavía no está disponible.",
    })
    await almacen.subir(`materiales/${id}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    expect(await pedirTextoOriginal(deps(coni), id)).toEqual({
      ok: true,
      url: `https://almacen.test/materiales/${id}/texto-original.txt?expira=300&descarga=texto-original.txt`,
    })
  })

  it("refuses an object left in R2 when its material row no longer exists", async () => {
    const huerfano = randomUUID()
    await almacen.subir(`materiales/${huerfano}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    expect(await pedirTextoOriginal(deps(coni), huerfano)).toEqual({ ok: false, error: "No encontré ese material." })
  })
})

describe("WAV is refused on every action (es_coni), even where row level security would let it", () => {
  it("changes nothing, starts nothing and signs nothing", async () => {
    const fallido = await material({ estado: "fallido", motivo: "sin_texto" })
    const listo = await material({ estado: "listo", rol: "estrategia" })
    await sembrarFicha(listo, IDEAS)
    await almacen.subir(`materiales/${listo}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    const antes = await Promise.all([fila(fallido), fila(listo)])

    const resultados = [
      await reintentarMaterial(deps(wav), fallido),
      await reprocesarMaterial(deps(wav), listo),
      await editarMaterial(deps(wav), { materialId: listo, autorId: otroAutor, rol: "evidencia" }),
      await editarFicha(deps(wav), {
        materialId: listo,
        resumen: "De WAV",
        ideasClave: IDEAS,
        citas: [],
        fuente: { autor: null, anio: null, enlace: null },
      }),
      await crearAutor(deps(wav), { nombre: `De WAV ${SUFIJO}`, credencial: "", tipo: "persona" }),
      await pedirTextoOriginal(deps(wav), listo),
    ]

    expect(resultados).toEqual(Array.from({ length: 6 }, () => ({ ok: false, error: SOLO_CONI })))
    expect(await Promise.all([fila(fallido), fila(listo)])).toEqual(antes)
    expect(disparos).toEqual([])
    const { rows } = await pool.query("select resumen from public.fichas where material_id = $1", [listo])
    expect(rows[0]?.resumen).toBe("Un resumen")
    const { rowCount } = await pool.query("select 1 from public.autores where nombre = $1", [`De WAV ${SUFIJO}`])
    expect(rowCount).toBe(0)
  })
})

describe("reintentarMaterial con un proveedor en pausa", () => {
  const PAUSA = "La Biblioteca está en pausa. Ya le avisamos a WAV."
  const abrir = (proveedor: string) =>
    pool.query("select public.abrir_pausa_de_proveedor($1, 'pago', 'x')", [proveedor])
  const cerrarTodas = () => pool.query("delete from public.pausas_de_proveedor")

  it("refuses while Claude is paused and starts nothing", async () => {
    const id = await material({ estado: "fallido", motivo: "sin_texto" })
    await abrir("claude")
    try {
      expect(await reintentarMaterial(deps(coni), id)).toEqual({ ok: false, error: PAUSA })
      expect(await fila(id)).toMatchObject({ estado: "fallido" })
      expect(disparos).toEqual([])
    } finally {
      await cerrarTodas()
    }
  })

  it("still works with only a Voyage pause open (A6)", async () => {
    const id = await material({ estado: "fallido", motivo: "sin_texto" })
    await abrir("voyage")
    try {
      expect(await reintentarMaterial(deps(coni), id)).toEqual({ ok: true })
    } finally {
      await cerrarTodas()
    }
  })
})
