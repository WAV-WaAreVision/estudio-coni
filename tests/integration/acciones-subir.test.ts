import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { crearMaterial, type DepsSubir } from "@/lib/acciones/biblioteca"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"
import { TAMANO_MAXIMO_BYTES } from "@/lib/dominio/biblioteca/subir"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>
type Fila = Record<string, unknown>

const SUFIJO = randomUUID().slice(0, 8)
const AHORA = new Date("2026-11-03T12:00:00.000Z")

let coni: Db
let autor = ""
const creados: string[] = []
const disparos: { materialId: string; intento: string | undefined }[] = []
const almacen = almacenEnMemoria()

function deps(db: Db, extra: Partial<DepsSubir> = {}): DepsSubir {
  return {
    db,
    almacen,
    disparar: {
      async material(materialId, intento) {
        disparos.push({ materialId, intento })
      },
    },
    nuevoId: randomUUID,
    ahora: () => AHORA,
    ...extra,
  }
}

const base = () => ({ autorId: autor, rol: "referente", declaracion: true })

async function crearOk(db: Db, entrada: Record<string, unknown>) {
  const resultado = await crearMaterial(deps(db), { ...base(), ...entrada })
  if (!resultado.ok) throw new Error(`crearMaterial falló: ${resultado.error}`)
  creados.push(resultado.materialId)
  return resultado
}

async function fila(id: string): Promise<Fila | null> {
  const { rows } = await pool.query<Fila>("select * from public.materiales where id = $1", [id])
  return rows[0] ?? null
}

async function cuantosCon(titulo: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from public.materiales where titulo = $1",
    [titulo],
  )
  return rows[0]?.n ?? 0
}

beforeAll(async () => {
  coni = await clienteDeConi()
  autor = await sembrarAutor(`Autora de subir ${SUFIJO}`)
})

afterEach(async () => {
  disparos.length = 0
  vi.restoreAllMocks()
  await pool.query("delete from public.materiales where id = any($1::uuid[])", [creados.splice(0)])
})

afterAll(async () => {
  await borrarSembrado([], [], [autor])
  await pool.end()
})

describe("crearMaterial", () => {
  it("as Coni, creates a procesando row owned by her and gives a signed PUT for the file", async () => {
    const titulo = `Apego adulto ${SUFIJO}`
    const resultado = await crearOk(coni, {
      tipo: "documento",
      titulo,
      rol: "evidencia",
      archivos: [{ nombre: "Tesis.PDF", tamano: 5000 }],
    })

    const material = await fila(resultado.materialId)
    expect(material).toMatchObject({
      tipo: "documento",
      titulo,
      autor_id: autor,
      rol: "evidencia",
      estado: "procesando",
      subido_por: CONI,
      archivo_clave: `materiales/${resultado.materialId}/original.pdf`,
      origen_url: null,
      texto_pegado: null,
    })
    expect(new Date(material?.declaracion_sin_pacientes_en as Date).toISOString()).toBe(AHORA.toISOString())
    expect(resultado.subidas).toEqual([
      {
        orden: 1,
        url: expect.stringContaining(`materiales/${resultado.materialId}/original.pdf`),
        tipoContenido: "application/pdf",
      },
    ])
  })

  it("stores a link as its address and needs no upload", async () => {
    const resultado = await crearOk(coni, { tipo: "link", url: "https://example.com/nota", archivos: [] })
    expect(resultado.subidas).toEqual([])
    expect(await fila(resultado.materialId)).toMatchObject({
      origen_url: "https://example.com/nota",
      archivo_clave: null,
    })
  })

  it("stores a YouTube link with its pasted transcript, and refuses it without one", async () => {
    const youtube = "https://www.youtube.com/watch?v=abc123"
    const creado = await crearOk(coni, { tipo: "link", url: youtube, textoPegado: "Hola a todos", archivos: [] })
    expect(await fila(creado.materialId)).toMatchObject({ origen_url: youtube, texto_pegado: "Hola a todos" })
    expect(await crearMaterial(deps(coni), { ...base(), tipo: "link", url: youtube, archivos: [] })).toEqual({
      ok: false,
      error: "Pega la transcripción del video.",
    })
  })

  it("stores a post as its pasted text, with an optional video", async () => {
    const solo = await crearOk(coni, { tipo: "post", textoPegado: "Un texto largo", archivos: [] })
    const conVideo = await crearOk(coni, {
      tipo: "post",
      textoPegado: "Con video",
      archivos: [{ nombre: "v.mov", tamano: 10 }],
    })
    expect(await fila(solo.materialId)).toMatchObject({ texto_pegado: "Un texto largo", archivo_clave: null })
    expect((await fila(conVideo.materialId))?.archivo_clave).toBe(`materiales/${conVideo.materialId}/original.mov`)
    expect(conVideo.subidas[0]?.tipoContenido).toBe("video/quicktime")
  })

  it("keeps the reference link of a video, which is never fetched", async () => {
    const resultado = await crearOk(coni, {
      tipo: "video",
      referencia: "https://instagram.com/reel/x",
      archivos: [{ nombre: "v.mp4", tamano: 10 }],
    })
    expect(await fila(resultado.materialId)).toMatchObject({ origen_url: "https://instagram.com/reel/x" })
  })

  it("saves each image in order and points archivo_clave at the first", async () => {
    const resultado = await crearOk(coni, {
      tipo: "imagen",
      archivos: [
        { nombre: "a.jpg", tamano: 10 },
        { nombre: "b.PNG", tamano: 10 },
        { nombre: "c.heic", tamano: 10 },
      ],
    })
    const { rows } = await pool.query<{ orden: number; archivo_clave: string }>(
      "select orden, archivo_clave from public.materiales_archivos where material_id = $1 order by orden",
      [resultado.materialId],
    )
    const carpeta = `materiales/${resultado.materialId}/`
    expect(rows).toEqual([
      { orden: 1, archivo_clave: `${carpeta}original-01.jpg` },
      { orden: 2, archivo_clave: `${carpeta}original-02.png` },
      { orden: 3, archivo_clave: `${carpeta}original-03.heic` },
    ])
    expect((await fila(resultado.materialId))?.archivo_clave).toBe(`${carpeta}original-01.jpg`)
    expect(resultado.subidas.map((s) => [s.orden, s.tipoContenido])).toEqual([
      [1, "image/jpeg"],
      [2, "image/png"],
      [3, "image/heic"],
    ])
  })

  it("refuses an entry that breaks a rule before touching the database", async () => {
    expect(await crearMaterial(deps(coni), { ...base(), tipo: "documento", archivos: [] })).toEqual({
      ok: false,
      error: "Falta el archivo.",
    })
    expect(
      await crearMaterial(deps(coni), {
        ...base(),
        tipo: "video",
        archivos: [{ nombre: "clase.mp4", tamano: TAMANO_MAXIMO_BYTES + 1 }],
      }),
    ).toEqual({ ok: false, error: "Ese archivo pesa más de 2 GB." })
  })

  it("says the author is gone when it does not exist anymore", async () => {
    expect(
      await crearMaterial(deps(coni), {
        ...base(),
        autorId: randomUUID(),
        tipo: "link",
        url: "https://example.com/otra",
        archivos: [],
      }),
    ).toEqual({ ok: false, error: "Ese autor ya no existe. Elígelo de nuevo." })
  })

  it("deletes the row when the upload cannot be signed, and answers the generic notice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const titulo = `Sin firma ${SUFIJO}`
    const sinFirma = deps(coni, {
      almacen: {
        ...almacen,
        urlDeSubida: async () => {
          throw new Error("R2 caído")
        },
      },
    })
    const resultado = await crearMaterial(sinFirma, {
      ...base(),
      titulo,
      tipo: "documento",
      archivos: [{ nombre: "a.pdf", tamano: 4 }],
    })
    expect(resultado).toEqual({ ok: false, error: ERROR_GENERICO })
    expect(await cuantosCon(titulo)).toBe(0)
  })
})
