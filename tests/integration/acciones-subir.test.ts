import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { confirmarMaterial, crearMaterial, type DepsSubir, descartarMaterial } from "@/lib/acciones/biblioteca"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"
import { TAMANO_MAXIMO_BYTES } from "@/lib/dominio/biblioteca/subir"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, MANTENEDOR, pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarAutor } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>
type Fila = Record<string, unknown>

const SUFIJO = randomUUID().slice(0, 8)
const AHORA = new Date("2026-11-03T12:00:00.000Z")
const SOLO_CONI = "Esta app es solo para Coni."
const GUARDADO_SIN_INICIAR =
  "El material quedó guardado, pero no pude iniciar su procesamiento. Toca Reintentar en un rato."
const FALTA_EL_ARCHIVO = "No encontré el archivo que subiste. Inténtalo de nuevo."

let coni: Db
let wav: Db
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
    // Every id handed out is cleaned up, also one a refused call should never have used.
    nuevoId: () => {
      const id = randomUUID()
      creados.push(id)
      return id
    },
    ahora: () => AHORA,
    ...extra,
  }
}

const base = () => ({ autorId: autor, rol: "referente", declaracion: true })

async function crearOk(db: Db, entrada: Record<string, unknown>) {
  const resultado = await crearMaterial(deps(db), { ...base(), ...entrada })
  if (!resultado.ok) throw new Error(`crearMaterial falló: ${resultado.error}`)
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

const enLaCarpeta = (materialId: string) => almacen.claves().filter((c) => c.startsWith(`materiales/${materialId}/`))
const NO_BORRA = async (): Promise<number> => {
  throw new Error("R2 caído")
}

beforeAll(async () => {
  ;[coni, wav] = await Promise.all([clienteDeConi(), clienteDelMantenedor()])
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

  it("deletes the row when the images cannot be saved, and answers the generic notice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const titulo = `Sin imágenes ${SUFIJO}`
    const sinImagenes = new Proxy(coni, {
      get(destino, propiedad) {
        if (propiedad === "from") {
          return (tabla: keyof Database["public"]["Tables"]) =>
            tabla === "materiales_archivos"
              ? { insert: async () => ({ data: null, error: { message: "caído", code: "XX000" } }) }
              : destino.from(tabla)
        }
        const valor: unknown = Reflect.get(destino, propiedad)
        return typeof valor === "function" ? valor.bind(destino) : valor
      },
    })
    const resultado = await crearMaterial(deps(sinImagenes), {
      ...base(),
      titulo,
      tipo: "imagen",
      archivos: [{ nombre: "a.jpg", tamano: 4 }],
    })
    expect(resultado).toEqual({ ok: false, error: ERROR_GENERICO })
    expect(await cuantosCon(titulo)).toBe(0)
  })
})

describe("confirmarMaterial", () => {
  it("starts the run once the file is in the store, with the material's own key", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([1, 2, 3, 4]))

    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(disparos).toEqual([{ materialId: creado.materialId, intento: undefined }])
  })

  it("starts a link right away: there is no file to wait for", async () => {
    const creado = await crearOk(coni, { tipo: "link", url: "https://example.com/z", archivos: [] })
    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(disparos).toEqual([{ materialId: creado.materialId, intento: undefined }])
  })

  it("needs every image of the material, and deletes it when one is missing", async () => {
    const creado = await crearOk(coni, {
      tipo: "imagen",
      archivos: [
        { nombre: "a.jpg", tamano: 1 },
        { nombre: "b.jpg", tamano: 1 },
      ],
    })
    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([1]))

    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: false, error: FALTA_EL_ARCHIVO })
    expect(disparos).toEqual([])
    expect(await fila(creado.materialId)).toBeNull()
    expect(enLaCarpeta(creado.materialId)).toEqual([])
  })

  it("deletes the material and starts nothing when the file never arrived", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: false, error: FALTA_EL_ARCHIVO })
    expect(disparos).toEqual([])
    expect(await fila(creado.materialId)).toBeNull()
  })

  it("deletes the material when the file in the store is empty", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([]))
    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: false, error: FALTA_EL_ARCHIVO })
    expect(await fila(creado.materialId)).toBeNull()
    expect(enLaCarpeta(creado.materialId)).toEqual([])
  })

  it("deletes the material when the object in the store is over 2 GB, whatever was declared", async () => {
    const creado = await crearOk(coni, { tipo: "video", archivos: [{ nombre: "a.mp4", tamano: 10 }] })
    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([1]))
    const enorme = deps(coni, { almacen: { ...almacen, tamano: async () => TAMANO_MAXIMO_BYTES + 1 } })

    expect(await confirmarMaterial(enorme, creado.materialId)).toEqual({
      ok: false,
      error: "Ese archivo pesa más de 2 GB.",
    })
    expect(disparos).toEqual([])
    expect(await fila(creado.materialId)).toBeNull()
    expect(enLaCarpeta(creado.materialId)).toEqual([])
  })

  it("answers the same and logs the material when its folder cannot be deleted", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    const sinBorrar = deps(coni, { almacen: { ...almacen, borrarCarpeta: NO_BORRA } })

    expect(await confirmarMaterial(sinBorrar, creado.materialId)).toEqual({ ok: false, error: FALTA_EL_ARCHIVO })
    expect(await fila(creado.materialId)).toBeNull()
    expect(error).toHaveBeenCalledWith(expect.stringContaining(creado.materialId), expect.any(Error))
  })

  it("never deletes a material that moved on while its file was being checked", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    const otraCorrida = deps(coni, {
      almacen: {
        ...almacen,
        tamano: async () => {
          await pool.query("update public.materiales set estado = 'listo' where id = $1", [creado.materialId])
          return null
        },
      },
    })

    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([1]))
    await confirmarMaterial(otraCorrida, creado.materialId)
    expect(await fila(creado.materialId)).toMatchObject({ estado: "listo" })
    expect(enLaCarpeta(creado.materialId)).toHaveLength(1)
  })

  it("answers ok and starts nothing for a material that is not procesando anymore (a second tap)", async () => {
    const creado = await crearOk(coni, { tipo: "link", url: "https://example.com/w", archivos: [] })
    await pool.query("update public.materiales set estado = 'listo' where id = $1", [creado.materialId])
    expect(await confirmarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(disparos).toEqual([])
  })

  it("leaves the material retryable and says it was saved when the run cannot start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const creado = await crearOk(coni, { tipo: "link", url: "https://example.com/caido", archivos: [] })
    const caido = deps(coni, {
      disparar: {
        material: async () => {
          throw new Error("Trigger caído")
        },
      },
    })

    expect(await confirmarMaterial(caido, creado.materialId)).toEqual({ ok: false, error: GUARDADO_SIN_INICIAR })
    expect(await fila(creado.materialId)).toMatchObject({
      estado: "procesando",
      motivo_fallo: "No pude iniciar el procesamiento. Reintenta.",
    })
  })

  it("does the same when the store cannot say whether the file is there (D3)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    const mudo = deps(coni, {
      almacen: {
        ...almacen,
        tamano: async () => {
          throw new Error("R2 caído")
        },
      },
    })

    expect(await confirmarMaterial(mudo, creado.materialId)).toEqual({ ok: false, error: GUARDADO_SIN_INICIAR })
    expect(disparos).toEqual([])
    expect(await fila(creado.materialId)).toMatchObject({
      estado: "procesando",
      motivo_fallo: "No pude iniciar el procesamiento. Reintenta.",
    })
  })

  it("says it did not find a material that does not exist", async () => {
    expect(await confirmarMaterial(deps(coni), randomUUID())).toEqual({ ok: false, error: "No encontré ese material." })
  })
})

describe("descartarMaterial", () => {
  it("deletes her material that is still procesando, and its folder in the store", async () => {
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    almacen.simularSubida(creado.subidas[0]?.url ?? "", new Uint8Array([1]))
    expect(await descartarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(await fila(creado.materialId)).toBeNull()
    expect(enLaCarpeta(creado.materialId)).toEqual([])
  })

  it("still answers ok and logs the material when its folder cannot be deleted", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const creado = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    const sinBorrar = deps(coni, { almacen: { ...almacen, borrarCarpeta: NO_BORRA } })

    expect(await descartarMaterial(sinBorrar, creado.materialId)).toEqual({ ok: true })
    expect(await fila(creado.materialId)).toBeNull()
    expect(error).toHaveBeenCalledWith(expect.stringContaining(creado.materialId), expect.any(Error))
  })

  it("never deletes a material that is ready", async () => {
    const creado = await crearOk(coni, { tipo: "link", url: "https://example.com/v", archivos: [] })
    await pool.query("update public.materiales set estado = 'listo' where id = $1", [creado.materialId])
    await almacen.subir(`materiales/${creado.materialId}/texto-original.txt`, new Uint8Array([1]), "text/plain")
    expect(await descartarMaterial(deps(coni), creado.materialId)).toEqual({ ok: true })
    expect(await fila(creado.materialId)).not.toBeNull()
    expect(enLaCarpeta(creado.materialId)).toHaveLength(1)
  })
})

describe("a material uploaded by someone else (D8)", () => {
  // Row level security lets Coni delete any material: the subido_por filter is the only guard here.
  async function deWav(): Promise<string> {
    const id = randomUUID()
    creados.push(id)
    await pool.query(
      `insert into public.materiales (id, tipo, titulo, autor_id, origen_url, declaracion_sin_pacientes_en, subido_por)
       values ($1, 'link', $2, $3, 'https://ejemplo.cl/de-wav', now(), $4)`,
      [id, `De WAV ${SUFIJO}`, autor, MANTENEDOR],
    )
    return id
  }

  it("is not confirmed by Coni: she does not find it and nothing starts", async () => {
    const id = await deWav()
    expect(await confirmarMaterial(deps(coni), id)).toEqual({ ok: false, error: "No encontré ese material." })
    expect(disparos).toEqual([])
  })

  it("is not discarded by Coni", async () => {
    const id = await deWav()
    await almacen.subir(`materiales/${id}/original.pdf`, new Uint8Array([1]), "application/pdf")
    await descartarMaterial(deps(coni), id)
    expect(await fila(id)).toMatchObject({ estado: "procesando", subido_por: MANTENEDOR })
    expect(enLaCarpeta(id)).toHaveLength(1)
  })
})

describe("WAV is refused on every upload action (es_coni), even where row level security would let it", () => {
  it("creates nothing, starts nothing and deletes nothing", async () => {
    const titulo = `De WAV ${SUFIJO}`
    const enProceso = await crearOk(coni, { tipo: "documento", archivos: [{ nombre: "a.pdf", tamano: 4 }] })
    almacen.simularSubida(enProceso.subidas[0]?.url ?? "", new Uint8Array([1]))

    const resultados = [
      await crearMaterial(deps(wav), { ...base(), titulo, tipo: "link", url: "https://ejemplo.cl/wav", archivos: [] }),
      await confirmarMaterial(deps(wav), enProceso.materialId),
      await descartarMaterial(deps(wav), enProceso.materialId),
    ]

    expect(resultados).toEqual(Array.from({ length: 3 }, () => ({ ok: false, error: SOLO_CONI })))
    expect(await cuantosCon(titulo)).toBe(0)
    expect(await fila(enProceso.materialId)).toMatchObject({ estado: "procesando", motivo_fallo: null })
    expect(disparos).toEqual([])
  })
})
