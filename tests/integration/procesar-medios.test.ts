import { afterAll, afterEach, describe, expect, it } from "vitest"
import { buscarFfmpegBasico } from "@/lib/ingesta/fotogramas"
import { procesarMaterial } from "@/lib/ingesta/procesar"
import { pool } from "./db"
import {
  almacenEnMemoria,
  COSTO_CLAUDE,
  conFfmpeg,
  crearMaterial,
  deps,
  fixture,
  gastos,
  limpiar,
  material,
  simularClaude,
  simularScribe,
  texto,
} from "./procesar-comun"

afterEach(limpiar)
afterAll(() => pool.end())

const FFMPEG = await buscarFfmpegBasico()
// A 1x1 lossy WebP: the ffmpeg of the test machine may not be able to encode WebP, but it decodes it.
const WEBP_1X1 = Uint8Array.from(Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64"))
const SIN_VOZ_NI_TEXTO = "No encontré voz ni texto en el video"

const HABLA: [string, number][] = [
  ["Hola,", 0.4],
  ["soy", 0.8],
  ["Coni.", 1.2],
  ["Hablemos", 12.3],
  ["de", 12.6],
  ["límites.", 13],
]

/** What the screen shows in each second of the fixture reel: three lines and a gap. */
const PANTALLA = (id: string): string => {
  const segundo = Number(id)
  if (segundo < 2) return "Hola soy Coni"
  if (segundo < 4) return "Hablemos de limites"
  if (segundo < 5) return ""
  return "Gracias por ver"
}

describe.skipIf(!FFMPEG)("audio y video (necesitan ffmpeg)", () => {
  const ffmpeg = FFMPEG ?? "ffmpeg"

  async function audioDePrueba(): Promise<Uint8Array> {
    return conFfmpeg(ffmpeg, ["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "libmp3lame"], "salida.mp3")
  }

  it("transcribes an audio with Scribe, reserving the spend from its duration", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const scribe = simularScribe("spa", HABLA)
    const id = await crearMaterial(almacen, {
      tipo: "audio",
      archivo: { extension: "mp3", tipo: "audio/mpeg", datos: await audioDePrueba() },
    })

    await procesarMaterial(await deps(almacen), id)

    expect(scribe.n).toBe(1)
    expect(scribe.llaves).toEqual(["sk_eleven_de_prueba"])
    expect(texto(almacen, id, "texto.txt")).toBe("[0:00 habla] Hola, soy Coni.\n[0:12 habla] Hablemos de límites.")
    const filas = await gastos(id)
    const transcripcion = filas.find((g) => g.paso === "transcripcion")
    expect(transcripcion).toMatchObject({ proveedor: "elevenlabs", estado: "confirmado" })
    expect(transcripcion?.real).toBeGreaterThan(0)
    expect(transcripcion?.real).toBeLessThan(0.001)
    expect((await material(id)).estado).toBe("listo")
  })

  it("fails an audio where Scribe hears nothing", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    simularScribe("spa", [])
    const id = await crearMaterial(almacen, {
      tipo: "audio",
      archivo: { extension: "mp3", datos: await audioDePrueba() },
    })

    await procesarMaterial(await deps(almacen), id)

    expect(await material(id)).toMatchObject({ estado: "fallido", motivo_fallo: "No encontré texto en el archivo." })
  })

  it("reads a reel on two tracks aligned by second, in Spanish of Chile", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude({ lectura: PANTALLA })
    simularScribe("spa", HABLA)
    const id = await crearMaterial(almacen, {
      tipo: "video",
      origen_url: "https://www.instagram.com/reel/xyz/",
      archivo: { extension: "mp4", tipo: "video/mp4", datos: await fixture("reel-subtitulado.mp4") },
    })

    await procesarMaterial(
      await deps(almacen, {
        fetch: async () => {
          throw new Error("el link de un video nunca se abre")
        },
      }),
      id,
    )

    const guardado = texto(almacen, id, "texto.txt") ?? ""
    expect(guardado).toContain("[0:00 habla] Hola, soy Coni.")
    expect(guardado).toContain("[0:12 habla] Hablemos de límites.")
    expect(guardado).toContain("[0:00 pantalla] Hola soy Coni")
    expect(guardado).toContain("[0:02 pantalla] Hablemos de limites")
    expect(guardado).toContain("[0:05 pantalla] Gracias por ver")
    expect(guardado.indexOf("[0:00 habla]")).toBeLessThan(guardado.indexOf("[0:00 pantalla]"))
    expect(claude.visiones).toHaveLength(1)
    expect(claude.visiones[0]?.length).toBeLessThanOrEqual(4)
    const filas = await gastos(id)
    expect(filas.find((g) => g.paso === "pantalla")).toMatchObject({
      proveedor: "anthropic",
      estado: "confirmado",
      real: COSTO_CLAUDE,
    })
    expect(filas.find((g) => g.paso === "transcripcion")).toMatchObject({
      proveedor: "elevenlabs",
      estado: "confirmado",
    })
    const fila = await material(id)
    expect(fila).toMatchObject({ estado: "listo", idioma_original: "es" })
  })

  it("keeps going with the screen text when the video has no audio stream, without calling Scribe", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ lectura: PANTALLA })
    const scribe = simularScribe("spa", HABLA)
    const sinAudio = await conFfmpeg(
      ffmpeg,
      ["-i", "entrada.mp4", "-an", "-c:v", "copy"],
      "salida.mp4",
      await fixture("reel-subtitulado.mp4"),
    )
    const id = await crearMaterial(almacen, { tipo: "video", archivo: { extension: "mp4", datos: sinAudio } })

    await procesarMaterial(await deps(almacen), id)

    expect(scribe.n).toBe(0)
    const guardado = texto(almacen, id, "texto.txt") ?? ""
    expect(guardado).not.toContain("habla]")
    expect(guardado).toContain("[0:00 pantalla] Hola soy Coni")
    expect((await material(id)).estado).toBe("listo")
  })

  it("keeps going with the screen text when Scribe hears only music", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ lectura: PANTALLA })
    const scribe = simularScribe("spa", [])
    const id = await crearMaterial(almacen, {
      tipo: "video",
      archivo: { extension: "mp4", datos: await fixture("reel-subtitulado.mp4") },
    })

    await procesarMaterial(await deps(almacen), id)

    expect(scribe.n).toBe(1)
    expect(texto(almacen, id, "texto.txt")).not.toContain("habla]")
    expect((await material(id)).estado).toBe("listo")
  })

  it("keeps going with the voice when the screen has no text", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ lectura: () => "" })
    simularScribe("spa", HABLA)
    const id = await crearMaterial(almacen, {
      tipo: "video",
      archivo: { extension: "mp4", datos: await fixture("reel-subtitulado.mp4") },
    })

    await procesarMaterial(await deps(almacen), id)

    const guardado = texto(almacen, id, "texto.txt") ?? ""
    expect(guardado).toContain("habla]")
    expect(guardado).not.toContain("pantalla]")
    expect((await material(id)).estado).toBe("listo")
  })

  it("fails when the video has neither voice nor on-screen text", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ lectura: () => "" })
    simularScribe("spa", [])
    const id = await crearMaterial(almacen, {
      tipo: "video",
      archivo: { extension: "mp4", datos: await fixture("reel-subtitulado.mp4") },
    })

    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "fallido", motivo: SIN_VOZ_NI_TEXTO })
    expect(await material(id)).toMatchObject({ estado: "fallido", motivo_fallo: SIN_VOZ_NI_TEXTO })
  })

  it("translates an English reel into Spanish and keeps both versions", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude({ lectura: () => "", idioma: "en" })
    simularScribe("eng", [
      ["Desire", 0.5],
      ["changes", 1],
      ["over", 1.5],
      ["time.", 2],
    ])
    const id = await crearMaterial(almacen, {
      tipo: "video",
      archivo: { extension: "mp4", datos: await fixture("reel-subtitulado.mp4") },
    })

    await procesarMaterial(await deps(almacen), id)

    expect(claude.adaptaciones).toEqual(["Desire changes over time."])
    expect(texto(almacen, id, "texto-original.txt")).toBe("[0:00 habla] Desire changes over time.")
    expect(texto(almacen, id, "texto.txt")).toBe("[0:00 habla] [adaptado] Desire changes over time.")
    expect((await material(id)).idioma_original).toBe("en")
  })

  it("does not pay transcription or vision again after a crash", async () => {
    const almacen = almacenEnMemoria()
    const caida = simularClaude({ lectura: PANTALLA, fichaFalla: true })
    const scribe = simularScribe("spa", HABLA)
    const id = await crearMaterial(almacen, {
      tipo: "video",
      archivo: { extension: "mp4", datos: await fixture("reel-subtitulado.mp4") },
    })
    await expect(procesarMaterial(await deps(almacen, { corrida: "run_a" }), id)).rejects.toThrow()
    expect(caida.visiones).toHaveLength(1)

    const sana = simularClaude({ lectura: PANTALLA })
    await procesarMaterial(await deps(almacen, { corrida: "run_a" }), id)

    expect(scribe.n).toBe(1)
    expect(sana.visiones).toEqual([])
    const filas = await gastos(id)
    expect(filas.filter((g) => g.paso === "transcripcion")).toHaveLength(1)
    expect(filas.filter((g) => g.paso === "pantalla")).toHaveLength(1)
    expect((await material(id)).estado).toBe("listo")
  })

  it("transcribes the video of a post and puts the pasted text first", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    simularScribe("spa", HABLA)
    const id = await crearMaterial(almacen, {
      tipo: "post",
      texto_pegado: "Pie del post sobre límites en la pareja.",
      archivo: { extension: "mp4", datos: await fixture("reel-subtitulado.mp4") },
    })

    await procesarMaterial(await deps(almacen), id)

    const guardado = texto(almacen, id, "texto.txt") ?? ""
    expect(guardado.startsWith("Pie del post sobre límites en la pareja.")).toBe(true)
    expect(guardado).toContain("[0:12 habla] Hablemos de límites.")
    expect(guardado).not.toContain("pantalla]")
  })
})

describe.skipIf(!FFMPEG)("imágenes (necesitan ffmpeg)", () => {
  const ffmpeg = FFMPEG ?? "ffmpeg"

  async function imagen(formato: "png" | "jpg", color: string): Promise<Uint8Array> {
    return conFfmpeg(
      ffmpeg,
      ["-f", "lavfi", "-i", `color=c=${color}:s=64x64:d=1`, "-frames:v", "1"],
      `salida.${formato}`,
    )
  }

  it("converts PNG and WebP to JPEG and reads each image in upload order, keeping the numbers", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude({ lectura: (id) => `texto de la imagen ${id}` })
    const id = await crearMaterial(almacen, {
      tipo: "imagen",
      archivos: [
        { extension: "png", tipo: "image/png", datos: await imagen("png", "red") },
        { extension: "jpg", tipo: "image/jpeg", datos: await imagen("jpg", "blue") },
        { extension: "webp", tipo: "image/webp", datos: WEBP_1X1 },
      ],
    })

    await procesarMaterial(await deps(almacen), id)

    expect(claude.visiones).toEqual([["1", "2", "3"]])
    expect(texto(almacen, id, "texto.txt")).toBe(
      "[imagen 1] texto de la imagen 1\n[imagen 2] texto de la imagen 2\n[imagen 3] texto de la imagen 3",
    )
    const filas = await gastos(id)
    expect(filas.find((g) => g.paso === "imagen")).toMatchObject({ proveedor: "anthropic", estado: "confirmado" })
    expect((await material(id)).estado).toBe("listo")
  })

  it("fails when no image has text", async () => {
    const almacen = almacenEnMemoria()
    simularClaude({ lectura: () => "" })
    const id = await crearMaterial(almacen, {
      tipo: "imagen",
      archivos: [{ extension: "png", datos: await imagen("png", "red") }],
    })

    await procesarMaterial(await deps(almacen), id)

    expect(await material(id)).toMatchObject({ estado: "fallido", motivo_fallo: "No encontré texto en el archivo." })
  })

  it("reads the single file of an image material that has no list of files", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    const id = await crearMaterial(almacen, {
      tipo: "imagen",
      origen_url: "https://www.instagram.com/p/abc/",
      archivo: { extension: "png", datos: await imagen("png", "red") },
    })

    await procesarMaterial(await deps(almacen), id)

    expect(claude.visiones).toEqual([["1"]])
  })
})
