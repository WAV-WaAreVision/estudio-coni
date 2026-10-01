// @vitest-environment node
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { assDe } from "@/lib/dominio/subtitulos"
import {
  buscarFfmpeg,
  buscarFfprobe,
  exigirMontserratBold,
  fuenteElegida,
  leerFontselect,
  quemarSubtitulos,
  sondear,
} from "@/lib/video/ffmpeg"

// Stand-ins for ffmpeg and ffprobe: shell scripts that answer like the real ones and record how they were called.
// The real programs are exercised in tests/integration/ffmpeg.test.ts.
let raiz: string

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), "coni-ffmpeg-test-"))
})

afterAll(async () => {
  await rm(raiz, { recursive: true, force: true })
})

let contador = 0

async function falso(cuerpo: string): Promise<string> {
  contador += 1
  const ruta = join(raiz, `falso-${contador}`)
  await writeFile(ruta, `#!/bin/sh\n${cuerpo}\n`)
  await chmod(ruta, 0o755)
  return ruta
}

const LISTA_CON_LIBASS =
  'if [ "$2" = "-filters" ]; then echo " .. subtitles         V->V       Render text subtitles onto input video using the libass library."; exit 0; fi'
const LISTA_SIN_LIBASS =
  'if [ "$2" = "-filters" ]; then echo " ... scale            V->V       Scale the input video size."; exit 0; fi'

const FONTSELECT =
  "[Parsed_subtitles_0 @ 0x7c107ccc0] fontselect: (Montserrat, 700, 0) -> Montserrat-Bold, 0, Montserrat-Bold"

const SONDA = {
  streams: [{ codec_type: "video", width: 1080, height: 1920 }, { codec_type: "audio" }],
  format: { duration: "41.5", size: "1000" },
}

function registro(nombre: string): string {
  return join(raiz, `registro-${nombre}`)
}

describe("buscarFfmpeg", () => {
  it("takes CONI_FFMPEG when it has the subtitles filter", async () => {
    const mio = await falso(LISTA_CON_LIBASS)
    expect(await buscarFfmpeg({ CONI_FFMPEG: mio, PATH: "" }, [])).toBe(mio)
  })

  it("skips a candidate without the subtitles filter and takes FFMPEG_PATH, which Trigger.dev sets", async () => {
    const sinLibass = await falso(LISTA_SIN_LIBASS)
    const delContenedor = await falso(LISTA_CON_LIBASS)
    expect(await buscarFfmpeg({ CONI_FFMPEG: sinLibass, FFMPEG_PATH: delContenedor, PATH: "" }, [])).toBe(delContenedor)
  })

  it("tries the fixed ffmpeg-full paths and then the PATH, in that order", async () => {
    const fijo = await falso(LISTA_CON_LIBASS)
    const carpetaPath = join(raiz, "bin-path")
    await mkdir(carpetaPath, { recursive: true })
    const enPath = join(carpetaPath, "ffmpeg")
    await writeFile(enPath, `#!/bin/sh\n${LISTA_CON_LIBASS}\n`)
    await chmod(enPath, 0o755)

    expect(await buscarFfmpeg({ PATH: carpetaPath }, [fijo])).toBe(fijo)
    expect(await buscarFfmpeg({ PATH: carpetaPath }, ["/no/existe/ffmpeg"])).toBe(enPath)
  })

  it("ignores candidates that do not exist or cannot run", async () => {
    const roto = await falso("exit 1")
    const bueno = await falso(LISTA_CON_LIBASS)
    expect(await buscarFfmpeg({ CONI_FFMPEG: "/no/existe/ffmpeg", FFMPEG_PATH: roto, PATH: "" }, [bueno])).toBe(bueno)
  })

  it("answers null when no candidate has libass", async () => {
    const sinLibass = await falso(LISTA_SIN_LIBASS)
    expect(await buscarFfmpeg({ CONI_FFMPEG: sinLibass, PATH: "" }, [])).toBeNull()
    expect(await buscarFfmpeg({ PATH: "" }, [])).toBeNull()
  })
})

describe("buscarFfprobe", () => {
  it("prefers FFPROBE_PATH, then the ffprobe next to the ffmpeg, then the PATH's", async () => {
    const carpeta = join(raiz, "par")
    await mkdir(carpeta, { recursive: true })
    const ffmpeg = join(carpeta, "ffmpeg")
    const vecino = join(carpeta, "ffprobe")
    await writeFile(vecino, "#!/bin/sh\n")
    await chmod(vecino, 0o755)

    expect(await buscarFfprobe(ffmpeg, { FFPROBE_PATH: "/usr/bin/ffprobe" })).toBe("/usr/bin/ffprobe")
    expect(await buscarFfprobe(ffmpeg, {})).toBe(vecino)
    expect(await buscarFfprobe(join(raiz, "otro", "ffmpeg"), {})).toBe("ffprobe")
  })
})

describe("leerFontselect", () => {
  it("reads the face CoreText chose on macOS", () => {
    expect(leerFontselect(FONTSELECT)).toEqual({
      familia: "Montserrat",
      peso: 700,
      archivo: "Montserrat-Bold",
      nombre: "Montserrat-Bold",
    })
  })

  it("reads the font file fontconfig chose on Linux, even when the path has commas and spaces", () => {
    const linea =
      "[Parsed_subtitles_0 @ 0x55d] fontselect: (Montserrat, 700, 0) -> /app/assets/fuentes/Mi, Fuente/Montserrat-Bold.ttf, 0, Montserrat-Bold"
    expect(leerFontselect(linea)).toEqual({
      familia: "Montserrat",
      peso: 700,
      archivo: "/app/assets/fuentes/Mi, Fuente/Montserrat-Bold.ttf",
      nombre: "Montserrat-Bold",
    })
  })

  it("reads a face that is not the one asked for, which is the case the check exists for", () => {
    const linea = "fontselect: (Montserrat, 700, 0) -> /Users/x/.r/.37470.otf, -1, Montserrat-Black"
    expect(leerFontselect(linea)).toMatchObject({ nombre: "Montserrat-Black", peso: 700 })
  })

  it("takes the first line when libass picks fallback faces after it", () => {
    const salida = `${FONTSELECT}\nfontselect: (Montserrat, 700, 0) -> Arial, 0, ArialMT\n`
    expect(leerFontselect(salida)?.nombre).toBe("Montserrat-Bold")
  })

  it("answers null when there is no fontselect line", () => {
    expect(leerFontselect("Using font provider coretext\n")).toBeNull()
    expect(leerFontselect("")).toBeNull()
  })
})

describe("quemarSubtitulos", () => {
  const ASS = assDe([[1, 2, "Hola"]])
  const VIDEO = new Uint8Array([1, 2, 3, 4])
  let fuentes: string

  beforeAll(async () => {
    fuentes = join(raiz, "fuentes-reales")
    await mkdir(fuentes, { recursive: true })
    await writeFile(join(fuentes, "Montserrat-Bold.ttf"), "no es una fuente")
  })

  function grabador(nombre: string): Promise<string> {
    const salida = registro(nombre)
    return falso(`${LISTA_CON_LIBASS}
{ for a in "$@"; do printf 'ARG:%s\\n' "$a"; done; printf 'CWD:%s\\n' "$(pwd)"; printf 'LS:%s\\n' "$(ls | tr '\\n' ' ')"; printf 'FUENTES:%s\\n' "$(readlink fuentes)"; printf 'ASS:%s\\n' "$(cat subtitulos.ass | head -c 20)"; printf 'VIDEO:%s\\n' "$(od -An -tu1 video.mp4 | tr -s ' ')"; } > "${salida}"
printf 'FINAL' > video-final.mp4`)
  }

  it("runs ffmpeg with the encoding arguments of coni.py and the subtitles filter with an explicit fontsdir", async () => {
    const ffmpeg = await grabador("quemar")

    const final = await quemarSubtitulos({ ffmpeg, video: VIDEO, ass: ASS, fontsdir: fuentes })

    expect(new TextDecoder().decode(final)).toBe("FINAL")
    const lineas = (await readFile(registro("quemar"), "utf8")).split("\n")
    const argumentos = lineas.filter((l) => l.startsWith("ARG:")).map((l) => l.slice(4))
    expect(argumentos).toEqual([
      "-hide_banner",
      "-v",
      "error",
      "-y",
      "-i",
      "video.mp4",
      "-vf",
      "subtitles=subtitulos.ass:fontsdir=fuentes",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "21",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      "video-final.mp4",
    ])
    expect(lineas).toContain(`FUENTES:${fuentes}`)
    expect(lineas.find((l) => l.startsWith("LS:"))).toContain("subtitulos.ass")
    expect(lineas.find((l) => l.startsWith("ASS:"))).toBe("ASS:[Script Info]")
    expect(lineas.find((l) => l.startsWith("VIDEO:"))).toContain("1 2 3 4")
  })

  it("resolves a relative fontsdir, so the link in the work folder always points at the real one", async () => {
    const ffmpeg = await grabador("relativa")
    await quemarSubtitulos({ ffmpeg, video: VIDEO, ass: ASS, fontsdir: "assets/fuentes" })
    const lineas = (await readFile(registro("relativa"), "utf8")).split("\n")
    expect(lineas).toContain(`FUENTES:${join(process.cwd(), "assets/fuentes")}`)
  })

  it("removes its work folder when it is done", async () => {
    const ffmpeg = await grabador("limpieza")
    await quemarSubtitulos({ ffmpeg, video: VIDEO, ass: ASS, fontsdir: fuentes })
    const cwd = (await readFile(registro("limpieza"), "utf8")).split("\n").find((l) => l.startsWith("CWD:"))
    expect(cwd).toBeDefined()
    await expect(access(cwd?.slice(4) ?? "")).rejects.toThrow()
  })

  it("fails with a plain error that carries only the last 400 characters of ffmpeg's stderr, and cleans up", async () => {
    const ffmpeg = await falso(
      `pwd > "${registro("falla")}"; printf '%s' "$(head -c 900 /dev/zero | tr '\\0' 'x')FIN" >&2; exit 1`,
    )

    const error = await quemarSubtitulos({ ffmpeg, video: VIDEO, ass: ASS, fontsdir: fuentes }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
    if (!(error instanceof Error)) throw new Error("se esperaba un Error")
    expect(error.message.startsWith("ffmpeg falló: ")).toBe(true)
    expect(error.message.endsWith("xxxFIN")).toBe(true)
    expect(error.message).toHaveLength("ffmpeg falló: ".length + 400)
    const cwd = (await readFile(registro("falla"), "utf8")).trim()
    await expect(access(cwd)).rejects.toThrow()
  })

  it("fails with a plain error when ffmpeg is not there", async () => {
    const error = await quemarSubtitulos({
      ffmpeg: "/no/existe/ffmpeg",
      video: VIDEO,
      ass: ASS,
      fontsdir: fuentes,
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ message: expect.stringContaining("ffmpeg falló") })
  })

  it("fails when ffmpeg exits well but leaves no file", async () => {
    const ffmpeg = await falso("exit 0")
    await expect(quemarSubtitulos({ ffmpeg, video: VIDEO, ass: ASS, fontsdir: fuentes })).rejects.toThrow()
  })
})

describe("fuenteElegida", () => {
  const ASS = assDe([
    [1.5, 2.5, "Hola"],
    [3, 4, "Chao"],
  ])
  let fuentes: string

  beforeAll(async () => {
    fuentes = join(raiz, "fuentes-probe")
    await mkdir(fuentes, { recursive: true })
  })

  it("renders one frame at the first cue in verbose mode and reports the face libass chose", async () => {
    const ffmpeg = await falso(`{ for a in "$@"; do printf 'ARG:%s\\n' "$a"; done; } > "${registro("fuente")}"
echo "${FONTSELECT}" >&2`)

    const fuente = await fuenteElegida({ ffmpeg, ass: ASS, fontsdir: fuentes })

    expect(fuente).toMatchObject({ familia: "Montserrat", peso: 700, nombre: "Montserrat-Bold" })
    const argumentos = (await readFile(registro("fuente"), "utf8"))
      .split("\n")
      .filter((l) => l.startsWith("ARG:"))
      .map((l) => l.slice(4))
    expect(argumentos).toContain("verbose")
    expect(argumentos).toContain("subtitles=subtitulos.ass:fontsdir=fuentes")
    expect(argumentos[argumentos.indexOf("-ss") + 1]).toBe("1.5")
    expect(argumentos).toContain("color=c=black:s=1080x1920:r=2:d=2.5")
    expect(argumentos[argumentos.indexOf("-frames:v") + 1]).toBe("1")
  })

  it("fails when the subtitles have no cue to test with", async () => {
    const ffmpeg = await falso("exit 0")
    await expect(fuenteElegida({ ffmpeg, ass: assDe([]), fontsdir: fuentes })).rejects.toThrow("diálogo")
  })

  it("fails when libass says nothing about the font", async () => {
    const ffmpeg = await falso('echo "Using font provider coretext" >&2')
    await expect(fuenteElegida({ ffmpeg, ass: ASS, fontsdir: fuentes })).rejects.toThrow("fontselect")
  })

  it("fails with a plain error when ffmpeg fails", async () => {
    const ffmpeg = await falso('echo "Invalid data" >&2; exit 1')
    await expect(fuenteElegida({ ffmpeg, ass: ASS, fontsdir: fuentes })).rejects.toThrow("ffmpeg falló: Invalid data")
  })
})

describe("sondear", () => {
  it("writes the video to disk, asks ffprobe for streams and format as JSON and parses the answer", async () => {
    const ffprobe = await falso(`{ for a in "$@"; do printf 'ARG:%s\\n' "$a"; done; } > "${registro("sonda")}"
for a; do ULTIMO="$a"; done
cp "$ULTIMO" "${registro("sonda-bytes")}"
echo '${JSON.stringify(SONDA)}'`)

    const info = await sondear({ ffprobe, bytes: new Uint8Array([9, 8, 7]) })

    expect(info).toEqual({ duracion: 41.5, ancho: 1080, alto: 1920, conAudio: true, bytes: 1000 })
    const argumentos = (await readFile(registro("sonda"), "utf8"))
      .split("\n")
      .filter((l) => l.startsWith("ARG:"))
      .map((l) => l.slice(4))
    expect(argumentos.slice(0, 6)).toEqual(["-v", "error", "-show_streams", "-show_format", "-of", "json"])
    expect([...(await readFile(registro("sonda-bytes")))]).toEqual([9, 8, 7])
  })

  it("fails with a plain error when ffprobe cannot read the file", async () => {
    const ffprobe = await falso('echo "moov atom not found" >&2; exit 1')
    await expect(sondear({ ffprobe, bytes: new Uint8Array([1]) })).rejects.toThrow("ffprobe falló: moov atom not found")
  })

  it("fails with a plain error when ffprobe does not print JSON", async () => {
    const ffprobe = await falso("echo 'no soy json'")
    const error = await sondear({ ffprobe, bytes: new Uint8Array([1]) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
  })

  it("fails with a message for Coni when ffprobe finds no video stream", async () => {
    const ffprobe = await falso(
      `echo '${JSON.stringify({ streams: [{ codec_type: "audio" }], format: { size: "1" } })}'`,
    )
    await expect(sondear({ ffprobe, bytes: new Uint8Array([1]) })).rejects.toBeInstanceOf(Falla)
  })
})

describe("exigirMontserratBold", () => {
  let fuentes: string

  beforeAll(async () => {
    fuentes = join(raiz, "fuentes-exigidas")
    await mkdir(fuentes, { recursive: true })
  })

  it("accepts the face libass chose when it is Montserrat Bold", async () => {
    const ffmpeg = await falso(`echo "${FONTSELECT}" >&2`)
    await expect(exigirMontserratBold({ ffmpeg, fontsdir: fuentes })).resolves.toMatchObject({
      nombre: "Montserrat-Bold",
    })
  })

  it("fails as a configuration error naming the face libass chose instead", async () => {
    const ffmpeg = await falso(
      'echo "fontselect: (Montserrat, 700, 0) -> /Users/x/.r/.37470.otf, -1, Montserrat-Black" >&2',
    )
    const error = await exigirMontserratBold({ ffmpeg, fontsdir: fuentes }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.stringContaining("Montserrat-Black") })
    expect(error).toMatchObject({ message: expect.stringContaining(fuentes) })
  })

  it("probes with a cue of its own, so it needs no subtitles", async () => {
    const ffmpeg = await falso(`{ for a in "$@"; do printf 'ARG:%s\\n' "$a"; done; } > "${registro("exigida")}"
echo "${FONTSELECT}" >&2`)
    await exigirMontserratBold({ ffmpeg, fontsdir: fuentes })
    const argumentos = (await readFile(registro("exigida"), "utf8")).split("\n")
    expect(argumentos).toContain("ARG:subtitles=subtitulos.ass:fontsdir=fuentes")
  })
})
