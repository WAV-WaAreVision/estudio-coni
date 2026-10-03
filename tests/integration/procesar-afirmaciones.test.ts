import { createHash } from "node:crypto"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { procesarMaterial } from "@/lib/ingesta/procesar"
import { aTramos } from "@/lib/ingesta/tramos"
import { MODELO_POR_TAREA } from "@/lib/proveedores/anthropic"
import { pool } from "./db"
import {
  almacenEnMemoria,
  crearMaterial,
  deps,
  ficha,
  gastos,
  limpiar,
  material,
  simularClaude,
  simularVoyage,
  TEXTO_CHILENO,
  texto,
  vectorDePrueba,
} from "./procesar-comun"

const temas: string[] = []

afterEach(async () => {
  await limpiar()
  for (const id of temas.splice(0)) await pool.query("delete from public.temas where id = $1", [id])
})
afterAll(() => pool.end())

const conLlave = { llaveVoyage: () => "pa-de-prueba" }
const TEXTO = TEXTO_CHILENO.repeat(4)
// Paragraphs of about 5k characters: three of them do not fit in one 12k chunk, two do.
const PARRAFO = `${"Hablar de lo que cada persona necesita ayuda a la pareja. ".repeat(88)}`
const TEXTO_DE_TRES_TRAMOS = [PARRAFO, PARRAFO, PARRAFO, PARRAFO, PARRAFO].join("\n\n")

interface FilaAfirmacion {
  autor_id: string
  tramo: number
  ubicacion: unknown
  idioma: string | null
  cita: string
  tiene_vector: boolean
  tema_id: string | null
}

async function afirmaciones(materialId: string): Promise<FilaAfirmacion[]> {
  const { rows } = await pool.query<FilaAfirmacion>(
    `select autor_id, tramo, ubicacion, idioma, cita, vector is not null as tiene_vector, tema_id
     from public.afirmaciones where material_id = $1 order by tramo, id`,
    [materialId],
  )
  return rows
}

async function autorDeConi(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
  const fila = rows[0]
  if (!fila) throw new Error("sin autor de Coni")
  return fila.id
}

describe("estrategia", () => {
  it("writes the card and nothing else: no claims, no translation, no embedding", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const voyage = simularVoyage()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO, rol: "estrategia" })

    const resultado = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(claude.fichas).toHaveLength(1)
    expect(claude.afirmaciones).toEqual([])
    expect(claude.adaptaciones).toEqual([])
    expect(voyage.n).toBe(0)
    expect((await ficha(id))?.resumen).toBe("Un resumen de la fuente.")
    expect(await afirmaciones(id)).toEqual([])
    expect((await material(id)).estado).toBe("listo")
    const { rows } = await pool.query("select 1 from public.embeddings_ficha where material_id = $1", [id])
    expect(rows).toEqual([])
  })
})

describe.each(["referente", "evidencia", "voz_propia"] as const)("%s", (rol) => {
  it("turns the chunk into claims with the author, the chunk number and the location, embeds and leaves it ready", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const voyage = simularVoyage()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO, rol })

    const resultado = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(claude.afirmaciones).toHaveLength(1)
    expect(claude.fichas).toEqual([])
    expect(await ficha(id)).toBeUndefined()
    const filas = await afirmaciones(id)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      autor_id: await autorDeConi(),
      tramo: 1,
      ubicacion: { pagina: null },
      idioma: "es",
      tiene_vector: true,
      tema_id: null,
    })
    expect(TEXTO).toContain(filas[0]?.cita ?? "no")
    expect(voyage.n).toBe(1)
    const pasos = await gastos(id)
    expect(pasos.map((g) => [g.proveedor, g.paso, g.estado])).toEqual(
      expect.arrayContaining([
        ["anthropic", "afirmaciones", "confirmado"],
        ["voyage", "embedding", "confirmado"],
      ]),
    )
    const fila = await material(id)
    expect(fila).toMatchObject({ estado: "listo", motivo_fallo: null })
    const pendiente = await pool.query<{ v: boolean }>(
      "select vinculos_pendientes as v from public.materiales where id = $1",
      [id],
    )
    expect(pendiente.rows[0]?.v).toBe(false)
  })
})

describe("sin traducción", () => {
  it("never translates or adapts, stores the original text only and detects the language without Claude", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      texto_pegado: "Vosotros teneis que coger el ordenador y el movil para hablar. ".repeat(10),
    })

    await procesarMaterial(await deps(almacen), id)

    expect(claude.adaptaciones).toEqual([])
    expect(claude.idiomas).toBe(0)
    expect(texto(almacen, id, "texto.txt")).toBeUndefined()
    expect(texto(almacen, id, "texto-original.txt")).toContain("Vosotros teneis")
    expect((await material(id)).idioma_original).toBe("es")
    expect((await gastos(id)).filter((g) => g.paso === "traduccion")).toEqual([])
  })

  it("keeps the language Claude saw in the chunks when nothing else says it", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ idioma: "fr" })
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: "Zxqv wprt kjhg." })

    await procesarMaterial(await deps(almacen), id)

    expect((await material(id)).idioma_original).toBe("fr")
  })
})

describe("por tramo", () => {
  it("pays and stores each chunk with its fingerprint, numbered from 001, and numbers the claims by chunk", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_DE_TRES_TRAMOS })

    await procesarMaterial(await deps(almacen), id)

    expect(claude.afirmaciones).toHaveLength(3)
    for (const nombre of ["tramo-001.json", "tramo-002.json", "tramo-003.json"]) {
      const guardado = JSON.parse(texto(almacen, id, `afirmaciones/${nombre}`) ?? "null")
      expect(guardado.datos.huella).toMatch(/^[0-9a-f]{64}$/)
    }
    expect((await afirmaciones(id)).map((a) => a.tramo)).toEqual([1, 2, 3])
    expect((await gastos(id)).filter((g) => g.paso === "afirmaciones")).toHaveLength(3)
  })

  it("pays nothing again for the chunks a crashed run already paid, and does not duplicate claims", async () => {
    const almacen = almacenEnMemoria()
    const caida = simularClaude({ afirmacionesFallanDesde: 2 })
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_DE_TRES_TRAMOS })
    await expect(procesarMaterial(await deps(almacen, { corrida: "run_a" }), id)).rejects.toThrow()
    expect(caida.afirmaciones).toHaveLength(2)
    expect((await material(id)).estado).toBe("procesando")

    const sana = simularClaude()
    const resultado = await procesarMaterial(await deps(almacen, { corrida: "run_a" }), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(sana.afirmaciones).toHaveLength(2)
    expect((await afirmaciones(id)).map((a) => a.tramo)).toEqual([1, 2, 3])
    const filas = (await gastos(id)).filter((g) => g.paso === "afirmaciones")
    expect(filas.filter((g) => g.estado === "confirmado")).toHaveLength(3)
    expect(filas.filter((g) => g.estado === "liberado")).toHaveLength(1)
  })

  it("rebuilds the claims from the checkpoints on a re-run without calling Claude or Voyage again", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const voyage = simularVoyage()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_DE_TRES_TRAMOS })
    await procesarMaterial(await deps(almacen, conLlave), id)
    const antes = await gastos(id)
    await pool.query("update public.materiales set estado = 'procesando' where id = $1", [id])

    const resultado = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(claude.afirmaciones).toHaveLength(3)
    expect(voyage.n).toBe(1)
    const filas = await afirmaciones(id)
    expect(filas.map((a) => a.tramo)).toEqual([1, 2, 3])
    expect(filas.every((a) => a.tiene_vector)).toBe(true)
    expect(await gastos(id)).toEqual(antes)
  })

  it("pays a chunk again when its checkpoint was made for other text", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })
    await procesarMaterial(await deps(almacen), id)
    const clave = `materiales/${id}/afirmaciones/tramo-001.json`
    const guardado = JSON.parse(texto(almacen, id, "afirmaciones/tramo-001.json") ?? "null")
    guardado.datos.huella = "0".repeat(64)
    await almacen.subir(clave, new TextEncoder().encode(JSON.stringify(guardado)), "application/json")
    await pool.query("update public.materiales set estado = 'procesando' where id = $1", [id])

    await procesarMaterial(await deps(almacen), id)

    expect(claude.afirmaciones).toHaveLength(2)
  })

  it("pays a chunk again when its checkpoint was made with another version of the extraction prompt", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })
    await procesarMaterial(await deps(almacen), id)
    const partes = JSON.parse(texto(almacen, id, "partes-original.json") ?? "null").partes
    const [tramo] = aTramos(partes)
    const clave = `materiales/${id}/afirmaciones/tramo-001.json`
    const guardado = JSON.parse(texto(almacen, id, "afirmaciones/tramo-001.json") ?? "null")
    // The fingerprint a checkpoint had before the prompt version joined it: chunk text and model only.
    guardado.datos.huella = createHash("sha256")
      .update([tramo?.texto ?? "", MODELO_POR_TAREA.extraerAfirmaciones.modelo].join("\0"))
      .digest("hex")
    await almacen.subir(clave, new TextEncoder().encode(JSON.stringify(guardado)), "application/json")
    await pool.query("update public.materiales set estado = 'procesando' where id = $1", [id])

    await procesarMaterial(await deps(almacen), id)

    expect(claude.afirmaciones).toHaveLength(2)
  })
})

describe("temas", () => {
  it("assigns the new claims to the nearest topic", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    simularVoyage()
    const { rows } = await pool.query<{ id: string }>(
      "insert into public.temas (nombre, centroide) values ('Tema de prueba', $1) returning id",
      [JSON.stringify(vectorDePrueba(0.5))],
    )
    const tema = rows[0]
    if (!tema) throw new Error("sin tema")
    temas.push(tema.id)
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })

    await procesarMaterial(await deps(almacen, conLlave), id)

    expect((await afirmaciones(id))[0]?.tema_id).toBe(tema.id)
  })
})

describe("sin Voyage", () => {
  it("leaves the claims without a vector and the material ready when there is no key", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const voyage = simularVoyage()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(voyage.n).toBe(0)
    expect((await afirmaciones(id)).map((a) => a.tiene_vector)).toEqual([false])
  })

  it("leaves the claims without a vector and the material ready when Voyage fails", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    simularVoyage(500)
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })

    const resultado = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect((await afirmaciones(id)).map((a) => a.tiene_vector)).toEqual([false])
    expect((await material(id)).estado).toBe("listo")
    expect((await gastos(id)).filter((g) => g.proveedor === "voyage").every((g) => g.estado === "liberado")).toBe(true)
  })
})

describe("compuerta de costo", () => {
  it("makes a 490,000-character text wait for confirmation and calls no provider", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: `${PARRAFO}\n\n`.repeat(98) })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "esperando_confirmacion" })
    expect(claude.total).toBe(0)
    expect(await gastos(id)).toEqual([])
  })

  it("does not ask about a 20,000-character text", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      texto_pegado: `${PARRAFO}\n\n${PARRAFO}\n\n${PARRAFO}`,
    })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
  })
})
