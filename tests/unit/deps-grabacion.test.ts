// @vitest-environment node
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { depsGrabacion } from "@/lib/produccion/deps-reales"

const VARIABLES = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "CONI_FFMPEG",
  "FFMPEG_PATH",
  "CONI_FONTSDIR",
] as const
const ANTES = Object.fromEntries(VARIABLES.map((nombre) => [nombre, process.env[nombre]]))
const PATH_ORIGINAL = process.env.PATH
// No ffmpeg of the machine running the tests may rescue a test about not finding one.
const SIN_FFMPEG_DEL_SISTEMA = { ffmpegFijos: [] } as const

const FILTROS =
  'if [ "$2" = "-filters" ]; then echo " .. subtitles         V->V       Render text subtitles."; exit 0; fi'
const FONTSELECT = "[Parsed_subtitles_0 @ 0x1] fontselect: (Montserrat, 700, 0) -> Montserrat-Bold, 0, Montserrat-Bold"

let raiz: string
let ffmpegBueno: string
let ffmpegConOtraFuente: string

async function falso(nombre: string, cuerpo: string): Promise<string> {
  const ruta = join(raiz, nombre)
  await writeFile(ruta, `#!/bin/sh\n${FILTROS}\n${cuerpo}\n`)
  await chmod(ruta, 0o755)
  return ruta
}

function entornoCompleto(): void {
  process.env.SUPABASE_URL = "http://127.0.0.1:1"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba"
  process.env.R2_ACCOUNT_ID = "cuenta"
  process.env.R2_ACCESS_KEY_ID = "llave"
  process.env.R2_SECRET_ACCESS_KEY = "secreto"
  process.env.R2_BUCKET = "balde"
  process.env.CONI_FFMPEG = ffmpegBueno
  process.env.CONI_FONTSDIR = join(raiz, "fuentes")
}

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), "coni-deps-grabacion-"))
  await mkdir(join(raiz, "fuentes"), { recursive: true })
  await mkdir(join(raiz, "bin-vacio"), { recursive: true })
  ffmpegBueno = await falso("ffmpeg-bueno", `echo "${FONTSELECT}" >&2`)
  ffmpegConOtraFuente = await falso(
    "ffmpeg-otra-fuente",
    'echo "fontselect: (Montserrat, 700, 0) -> /x.otf, -1, Montserrat-Black" >&2',
  )
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

beforeEach(() => {
  for (const nombre of VARIABLES) delete process.env[nombre]
  process.env.PATH = join(raiz, "bin-vacio")
})

afterEach(() => {
  process.env.PATH = PATH_ORIGINAL
  for (const nombre of VARIABLES) {
    const valor = ANTES[nombre]
    if (valor === undefined) delete process.env[nombre]
    else process.env[nombre] = valor
  }
})

const ESPERA = { callbackUrl: "https://api.trigger.dev/callback", esperarRender: async () => {} }

describe("depsGrabacion", () => {
  it("names the missing Supabase variable first", async () => {
    await expect(depsGrabacion(ESPERA)).rejects.toThrow("SUPABASE_URL")
  })

  it.each(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"])(
    "names %s when it is missing, before looking for ffmpeg",
    async (faltante) => {
      entornoCompleto()
      delete process.env[faltante]
      await expect(depsGrabacion(ESPERA)).rejects.toThrow(faltante)
    },
  )

  it("fails as a configuration error, before any request, when no ffmpeg has libass", async () => {
    entornoCompleto()
    delete process.env.CONI_FFMPEG
    const error = await depsGrabacion(ESPERA, SIN_FFMPEG_DEL_SISTEMA).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.stringContaining("libass") })
  })

  it("fails as a configuration error when libass would pick another face than Montserrat Bold", async () => {
    entornoCompleto()
    process.env.CONI_FFMPEG = ffmpegConOtraFuente
    const error = await depsGrabacion(ESPERA).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.stringContaining("Montserrat-Black") })
  })

  it("builds the dependencies of a run with the callback and the wait it was given", async () => {
    entornoCompleto()
    const esperas: string[] = []

    const deps = await depsGrabacion(
      {
        callbackUrl: "https://api.trigger.dev/callback",
        esperarRender: async (videoId) => {
          esperas.push(videoId)
        },
      },
      SIN_FFMPEG_DEL_SISTEMA,
    )

    expect(deps.callbackUrl).toBe("https://api.trigger.dev/callback")
    await deps.esperarRender("v_1")
    expect(esperas).toEqual(["v_1"])
    expect(typeof deps.quemar).toBe("function")
    expect(typeof deps.sondear).toBe("function")
    expect(typeof deps.almacen.subir).toBe("function")
    expect(deps.ahora()).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
