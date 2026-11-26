import { createHash } from "node:crypto"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { procesarMaterial } from "@/lib/ingesta/procesar"
import { aTramos } from "@/lib/ingesta/tramos"
import { MODELO_POR_TAREA } from "@/lib/proveedores/anthropic"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
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
  await pool.query("delete from public.pausas_de_proveedor")
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

describe("marcas y ganchos (6a)", () => {
  const GANCHO = "El deseo sexual cambia a lo largo de la vida"
  const extraDeAfirmacion = {
    marcas: [
      { marca: "emocion", red: "instagram", valor: "vergüenza", frase: null, certeza: "alta", porQue: null },
      { marca: "emocion", red: "linkedin", valor: "Escepticismo", frase: null, certeza: "media", porQue: null },
      {
        marca: "problema",
        red: "instagram",
        valor: "no merecer los logros",
        frase: null,
        certeza: "media",
        porQue: null,
      },
      { marca: "dato", red: "todas", valor: "cifra", frase: "30%", certeza: "baja", porQue: null },
    ],
    gancho_detalle: {
      fraseExacta: GANCHO,
      fraseSinGancho: "El deseo cambia con los años.",
      tipo: "Afirmación contraria",
      certeza: "media",
    },
  }

  async function marcas(materialId: string) {
    const { rows } = await pool.query(
      `select m.marca, m.red, m.valor, m.version_id is not null as con_version
       from public.afirmacion_marcas m join public.afirmaciones a on a.id = m.afirmacion_id
       where a.material_id = $1 order by m.marca, m.red`,
      [materialId],
    )
    return rows
  }

  async function ganchos(materialId: string) {
    const { rows } = await pool.query(
      `select g.tipo, g.frase_exacta, g.frase_sin_gancho, g.version_id is not null as con_version
       from public.ganchos g join public.afirmaciones a on a.id = g.afirmacion_id where a.material_id = $1`,
      [materialId],
    )
    return rows
  }

  it("stores each claim's marks per network and its hook, pointing to the vigente list versions", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ extraDeAfirmacion })
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(await marcas(id)).toEqual([
      { marca: "dato", red: "todas", valor: "cifra", con_version: false },
      { marca: "emocion", red: "instagram", valor: "verguenza", con_version: true },
      { marca: "emocion", red: "linkedin", valor: "escepticismo", con_version: true },
      { marca: "problema", red: "instagram", valor: "no_merecer_logros", con_version: true },
    ])
    expect(await ganchos(id)).toEqual([
      {
        tipo: "afirmacion_contraria",
        frase_exacta: GANCHO,
        frase_sin_gancho: "El deseo cambia con los años.",
        con_version: true,
      },
    ])
  })

  it("keeps each claim's own marks and hook when a material has several claims", async () => {
    const almacen = almacenEnMemoria()
    const parrafo = (palabra: string) => `Hablar de ${palabra} ayuda a la pareja. `.repeat(150)
    const dePalabra = (fuente: string) => (fuente.includes("alfa") ? "alfa" : "gamma")
    simularClaude({
      extraDeAfirmacion: (fuente) => ({
        marcas: [
          { marca: "dato", red: "todas", valor: dePalabra(fuente), frase: "30%", certeza: "alta", porQue: null },
        ],
        gancho_detalle: {
          fraseExacta: `Hablar de ${dePalabra(fuente)} ayuda a la pareja.`,
          fraseSinGancho: "Sin gancho.",
          tipo: "Afirmación contraria",
          certeza: "media",
        },
      }),
    })
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      texto_pegado: [parrafo("alfa"), parrafo("beta"), parrafo("gamma")].join("\n\n"),
    })

    await procesarMaterial(await deps(almacen), id)

    const { rows } = await pool.query<{ cita: string; valor: string; gancho: string }>(
      `select a.cita, m.valor, g.frase_exacta as gancho
       from public.afirmaciones a
       join public.afirmacion_marcas m on m.afirmacion_id = a.id
       join public.ganchos g on g.afirmacion_id = a.id
       where a.material_id = $1 order by a.tramo`,
      [id],
    )
    expect(rows).toHaveLength(2)
    for (const fila of rows) {
      const palabra = fila.cita.includes("alfa") ? "alfa" : "gamma"
      expect(fila.valor).toBe(palabra)
      expect(fila.gancho).toBe(`Hablar de ${palabra} ayuda a la pareja.`)
    }
    expect(new Set(rows.map((r) => r.valor)).size).toBe(2)
  })

  it("leaves the same marks and hooks when the material is processed again", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ extraDeAfirmacion })
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })
    await procesarMaterial(await deps(almacen), id)
    const antes = { marcas: await marcas(id), ganchos: await ganchos(id) }
    await pool.query("update public.materiales set estado = 'procesando' where id = $1", [id])

    await procesarMaterial(await deps(almacen), id)

    expect(await afirmaciones(id)).toHaveLength(1)
    expect({ marcas: await marcas(id), ganchos: await ganchos(id) }).toEqual(antes)
    expect(antes.marcas).toHaveLength(4)
  })

  it("stores no marks and no hook for an answer without them", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })

    await procesarMaterial(await deps(almacen), id)

    expect(await afirmaciones(id)).toHaveLength(1)
    expect(await marcas(id)).toEqual([])
    expect(await ganchos(id)).toEqual([])
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

describe("Voyage en pausa", () => {
  it("opens the Voyage pause and emails WAV once, but the material ends ready with no pause text (A6)", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    simularVoyage(401)
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })
    const avisos = notificadorEnMemoria()
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const resultado = await procesarMaterial(await deps(almacen, { ...conLlave, avisos }), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(await material(id)).toMatchObject({ estado: "listo", motivo_fallo: null })
    expect((await afirmaciones(id)).map((a) => a.tiene_vector)).toEqual([false])
    const { rows } = await pool.query(
      "select proveedor, motivo from public.pausas_de_proveedor where cerrada_en is null",
    )
    expect(rows).toEqual([{ proveedor: "voyage", motivo: "llave" }])
    expect(avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["Voyage en pausa: llave rechazada"])
    expect(avisos.aConiEnviados).toEqual([])
    // The log carries WAV's detail, not the Biblioteca text meant for Coni.
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("Voyage respondió HTTP 401"))
    aviso.mockRestore()
  })
})

describe("Voyage en pausa sin correo", () => {
  it("does not fail the material when the pause cannot email WAV (A6)", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    simularVoyage(401)
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO })
    const avisos = {
      ...notificadorEnMemoria(),
      aWav: async () => {
        throw new Error("Resend no responde")
      },
    }
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const resultado = await procesarMaterial(await deps(almacen, { ...conLlave, avisos }), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(await material(id)).toMatchObject({ estado: "listo", motivo_fallo: null })
    expect(registro).toHaveBeenCalledWith(expect.stringContaining("Resend no responde"))
    registro.mockRestore()
    aviso.mockRestore()
  })
})

describe("sin compuerta de costo", () => {
  it("asks for the claims of every chunk of a 490,000-character text, without a stop", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: `${PARRAFO}\n\n`.repeat(98) })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "listo" })
    const partes = JSON.parse(texto(almacen, id, "partes-original.json") ?? "null").partes
    expect(claude.afirmaciones).toHaveLength(aTramos(partes).length)
    expect((await material(id)).estado).toBe("listo")
  })

  it("runs a 20,000-character text to the end as before", async () => {
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
