import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { alinearConGuion, assDe, leerSrt } from "@/lib/dominio/subtitulos"
import { depsGrabacion } from "@/lib/produccion/deps-reales"
import { revisarVideo } from "@/lib/video/chequeos"
import {
  buscarFfmpeg,
  buscarFfprobe,
  exigirMontserratBold,
  fuenteElegida,
  quemarSubtitulos,
  sondear,
} from "@/lib/video/ffmpeg"

const ejecutar = promisify(execFile)

const RAIZ_DEL_PROYECTO = resolve(".")
const FUENTES = join(RAIZ_DEL_PROYECTO, "assets/fuentes")
const MONTSERRAT_BOLD = join(FUENTES, "Montserrat-Bold.ttf")
const FFMPEG = await buscarFfmpeg()
const ffprobe = FFMPEG ? await buscarFfprobe(FFMPEG) : "ffprobe"

// Subtitles at 1 to 2 s and 3 to 4 s; the frame sampled at 0.5 s has none.
const ASS = assDe([
  [1, 2, "Hola, soy Coni."],
  [3, 4, "Hablemos de límites."],
])

let carpeta: string

/** A solid dark clip with a sine tone, encoded like HeyGen's output (H.264, AAC, yuv420p). */
async function clip(ffmpeg: string, segundos: number): Promise<Uint8Array> {
  const destino = join(carpeta, `clip-${segundos}.mp4`)
  await ejecutar(ffmpeg, [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x203040:s=1080x1920:r=25:d=${segundos}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${segundos}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    destino,
  ])
  return new Uint8Array(await readFile(destino))
}

/** Mean luma of the band where the subtitles go (centre x 540, y 1344), at `segundo`. */
async function brilloDeLaFranja(ffmpeg: string, video: Uint8Array, segundo: number): Promise<number> {
  const archivo = join(carpeta, `muestra-${segundo}-${video.length}.mp4`)
  await writeFile(archivo, video)
  const { stdout } = await ejecutar(
    ffmpeg,
    [
      "-hide_banner",
      "-v",
      "error",
      "-ss",
      String(segundo),
      "-i",
      archivo,
      "-frames:v",
      "1",
      "-vf",
      "crop=800:200:140:1244,format=gray",
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  )
  return stdout.reduce((suma, byte) => suma + byte, 0) / stdout.length
}

beforeAll(async () => {
  carpeta = await mkdtemp(join(tmpdir(), "coni-ffmpeg-int-"))
})

afterAll(async () => {
  await rm(carpeta, { recursive: true, force: true })
})

describe.skipIf(!FFMPEG)("ffmpeg with libass (skipped without it: brew install ffmpeg-full)", () => {
  const ffmpeg = FFMPEG ?? "ffmpeg"

  it("burns the subtitles of two cues into a 6 s Reel that then passes the video checks", async () => {
    const original = await clip(ffmpeg, 6)

    const final = await quemarSubtitulos({ ffmpeg, video: original, ass: ASS, fontsdir: FUENTES })

    const info = await sondear({ ffprobe, bytes: final })
    expect(info).toMatchObject({ ancho: 1080, alto: 1920, conAudio: true })
    expect(info.duracion).toBeGreaterThan(5.5)
    expect(info.duracion).toBeLessThan(6.5)
    expect(info.bytes).toBe(final.length)
    expect(revisarVideo(info)).toEqual([])
  })

  it("draws white text in the safe zone during a cue and nothing outside it", async () => {
    const original = await clip(ffmpeg, 6)
    const final = await quemarSubtitulos({ ffmpeg, video: original, ass: ASS, fontsdir: FUENTES })

    const sinTextoAntes = await brilloDeLaFranja(ffmpeg, original, 1.5)
    const conTexto = await brilloDeLaFranja(ffmpeg, final, 1.5)
    const conOtraFrase = await brilloDeLaFranja(ffmpeg, final, 3.5)
    const fueraDeCue = await brilloDeLaFranja(ffmpeg, final, 0.5)

    expect(conTexto - sinTextoAntes).toBeGreaterThan(5)
    expect(conOtraFrase - sinTextoAntes).toBeGreaterThan(5)
    expect(Math.abs(fueraDeCue - sinTextoAntes)).toBeLessThan(1)
  })

  it("burns the subtitles of a real reel (HeyGen's SRT aligned with the approved script) over a 48 s clip", async () => {
    const reel = join(RAIZ_DEL_PROYECTO, "tests/fixtures/goldens/2026-09-25-taller-propia-diosa")
    const srt = await readFile(join(reel, "subtitulos.srt"), "utf8")
    const guion = await readFile(join(reel, "guion.txt"), "utf8")
    const ass = assDe(alinearConGuion(leerSrt(srt), guion))
    const original = await clip(ffmpeg, 48)

    const final = await quemarSubtitulos({ ffmpeg, video: original, ass, fontsdir: FUENTES })

    const info = await sondear({ ffprobe, bytes: final })
    expect(revisarVideo(info)).toEqual([])
    expect(info.duracion).toBeGreaterThan(47.5)
  })

  it("flags a 3 s clip as too short", async () => {
    const corto = await clip(ffmpeg, 3)
    const info = await sondear({ ffprobe, bytes: corto })
    const hallazgos = revisarVideo(info)
    expect(hallazgos.map((h) => h.regla)).toEqual(["duracion"])
  })

  it("surfaces ffmpeg's own words when the input is not a video", async () => {
    const error = await quemarSubtitulos({
      ffmpeg,
      video: new Uint8Array([1, 2, 3]),
      ass: ASS,
      fontsdir: FUENTES,
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ message: expect.stringMatching(/^ffmpeg falló: [\s\S]+/) })
  })

  // Q3 of the design: libass picks a face by name and can settle for another variant without saying so. A machine
  // with Adobe Fonts synced picks Montserrat Black when it is not given the folder; with it, Montserrat Bold.
  it.skipIf(!existsSync(MONTSERRAT_BOLD))(
    "selects Montserrat Bold from assets/fuentes (skipped without assets/fuentes/Montserrat-Bold.ttf)",
    async () => {
      const fuente = await fuenteElegida({ ffmpeg, ass: ASS, fontsdir: FUENTES })

      expect(fuente.familia).toBe("Montserrat")
      expect(fuente.peso).toBe(700)
      expect(fuente.nombre).toBe("Montserrat-Bold")
    },
  )

  it.skipIf(!existsSync(MONTSERRAT_BOLD))(
    "passes the check the container runs before a render when assets/fuentes holds Montserrat Bold (skipped without it)",
    async () => {
      await expect(exigirMontserratBold({ ffmpeg, fontsdir: FUENTES })).resolves.toMatchObject({
        nombre: "Montserrat-Bold",
      })
    },
  )

  describe("depsGrabacion", () => {
    const VARIABLES = {
      SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba",
      RESEND_API_KEY: "re_de_prueba",
      AVISOS_REMITENTE: "Estudio <avisos@estudio.test>",
      AVISOS_CORREO_CONI: "coni@estudio.test",
      AVISOS_CORREO_WAV: "wav@estudio.test",
      R2_ACCOUNT_ID: "cuenta",
      R2_ACCESS_KEY_ID: "llave",
      R2_SECRET_ACCESS_KEY: "secreto",
      R2_BUCKET: "balde",
      CONI_FFMPEG: ffmpeg,
    }
    const antes: Record<string, string | undefined> = {}

    beforeAll(() => {
      for (const nombre of [...Object.keys(VARIABLES), "CONI_FONTSDIR"]) antes[nombre] = process.env[nombre]
      Object.assign(process.env, VARIABLES)
      delete process.env.CONI_FONTSDIR
    })

    afterAll(() => {
      for (const [nombre, valor] of Object.entries(antes)) {
        if (valor === undefined) delete process.env[nombre]
        else process.env[nombre] = valor
      }
    })

    it.skipIf(!existsSync(MONTSERRAT_BOLD))(
      "finds the fonts under the working directory and burns and checks a clip with the real programs",
      async () => {
        const deps = await depsGrabacion({
          callbackUrl: "https://api.trigger.dev/callback",
          esperarRender: async () => {},
          esperar: async () => {},
        })

        const final = await deps.quemar({ video: await clip(ffmpeg, 6), ass: ASS })
        const hallazgos = revisarVideo(await deps.sondear(final))

        expect(hallazgos).toEqual([])
      },
    )
  })
})
