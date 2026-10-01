// @vitest-environment node
import { describe, expect, it } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { type InfoVideo, infoDesdeFfprobe, LIMITE_BYTES, revisarVideo } from "@/lib/video/chequeos"

const BUENO: InfoVideo = { duracion: 41.5, ancho: 1080, alto: 1920, conAudio: true, bytes: 30 * 1024 * 1024 }

describe("revisarVideo", () => {
  it("finds nothing wrong with a 41 s, 1080x1920 video with audio of 30 MB", () => {
    expect(revisarVideo(BUENO)).toEqual([])
  })

  it.each([5, 90])("accepts a duration of exactly %s s", (duracion) => {
    expect(revisarVideo({ ...BUENO, duracion })).toEqual([])
  })

  it.each([4.99, 90.01, 0, 3])("blocks a duration of %s s", (duracion) => {
    const hallazgos = revisarVideo({ ...BUENO, duracion })
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]).toMatchObject({ regla: "duracion", tipo: "bloquea" })
    expect(hallazgos[0]?.mensaje).toContain("entre 5 y 90 s")
  })

  it("tells Coni the duration it found, with one decimal at most", () => {
    expect(revisarVideo({ ...BUENO, duracion: 3.04 })[0]?.mensaje).toBe(
      "El video dura 3 s y tiene que durar entre 5 y 90 s.",
    )
    expect(revisarVideo({ ...BUENO, duracion: 93.46 })[0]?.mensaje).toBe(
      "El video dura 93.5 s y tiene que durar entre 5 y 90 s.",
    )
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("blocks a duration that is not a real time: %s", (duracion) => {
    expect(revisarVideo({ ...BUENO, duracion }).map((h) => h.regla)).toEqual(["duracion"])
  })

  it.each([
    [1920, 1080],
    [1080, 1080],
    [720, 1280],
    [1081, 1920],
    [1080, 1919],
  ])("blocks a frame of %ix%i, because it has to be exactly 1080x1920", (ancho, alto) => {
    const hallazgos = revisarVideo({ ...BUENO, ancho, alto })
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]).toMatchObject({ regla: "formato", tipo: "bloquea" })
    expect(hallazgos[0]?.mensaje).toContain(`${ancho}x${alto}`)
    expect(hallazgos[0]?.mensaje).toContain("1080x1920")
  })

  it("blocks a video without audio", () => {
    const hallazgos = revisarVideo({ ...BUENO, conAudio: false })
    expect(hallazgos).toEqual([{ regla: "audio", tipo: "bloquea", mensaje: "El video no tiene audio." }])
  })

  it("accepts a video one byte under 300 MB and blocks one of exactly 300 MB", () => {
    expect(LIMITE_BYTES).toBe(300 * 1024 * 1024)
    expect(revisarVideo({ ...BUENO, bytes: LIMITE_BYTES - 1 })).toEqual([])
    const hallazgos = revisarVideo({ ...BUENO, bytes: LIMITE_BYTES })
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]).toMatchObject({ regla: "tamano", tipo: "bloquea" })
    expect(hallazgos[0]?.mensaje).toContain("300 MB")
  })

  it("blocks an empty file", () => {
    expect(revisarVideo({ ...BUENO, bytes: 0 }).map((h) => h.regla)).toEqual(["tamano"])
  })

  it("reports every problem at once, in a fixed order", () => {
    const hallazgos = revisarVideo({ duracion: 2, ancho: 720, alto: 1280, conAudio: false, bytes: LIMITE_BYTES + 1 })
    expect(hallazgos.map((h) => h.regla)).toEqual(["duracion", "formato", "audio", "tamano"])
    expect(hallazgos.every((h) => h.tipo === "bloquea")).toBe(true)
  })

  it("writes messages for Coni: Chilean Spanish, no em dashes", () => {
    const hallazgos = revisarVideo({ duracion: 2, ancho: 720, alto: 1280, conAudio: false, bytes: LIMITE_BYTES })
    for (const hallazgo of hallazgos) {
      expect(hallazgo.mensaje).not.toContain(String.fromCodePoint(0x2014))
      expect(hallazgo.mensaje.endsWith(".")).toBe(true)
    }
  })
})

// What `ffprobe -v error -show_streams -show_format -of json` prints for a Reel: strings for the numbers of `format`.
const SONDA = {
  streams: [
    { index: 0, codec_name: "h264", codec_type: "video", width: 1080, height: 1920, duration: "41.480000" },
    { index: 1, codec_name: "aac", codec_type: "audio", channels: 2, duration: "41.500000" },
  ],
  format: {
    filename: "video.mp4",
    nb_streams: 2,
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    duration: "41.500000",
    size: "31457280",
  },
}

describe("infoDesdeFfprobe", () => {
  it("reads size, duration, frame size and the presence of audio from the ffprobe JSON", () => {
    expect(infoDesdeFfprobe(SONDA)).toEqual({
      duracion: 41.5,
      ancho: 1080,
      alto: 1920,
      conAudio: true,
      bytes: 31_457_280,
    })
  })

  it("says there is no audio when there is no audio stream", () => {
    const sinAudio = { ...SONDA, streams: SONDA.streams.filter((s) => s.codec_type === "video") }
    expect(infoDesdeFfprobe(sinAudio).conAudio).toBe(false)
  })

  it("takes the duration of the video stream when the container does not say it", () => {
    const { duration: _sin, ...formato } = SONDA.format
    expect(infoDesdeFfprobe({ ...SONDA, format: formato }).duracion).toBeCloseTo(41.48, 2)
  })

  it("reads the first video stream when a cover image comes first", () => {
    const conPortada = {
      ...SONDA,
      streams: [{ index: 2, codec_type: "video", width: 300, height: 300 }, ...SONDA.streams],
    }
    expect(infoDesdeFfprobe(conPortada)).toMatchObject({ ancho: 300, alto: 300 })
  })

  it.each([
    ["not an object", "hola"],
    ["null", null],
    ["no streams", { format: SONDA.format }],
    ["no format", { streams: SONDA.streams }],
    ["no video stream", { ...SONDA, streams: [SONDA.streams[1]] }],
    ["a size that is not a number", { ...SONDA, format: { ...SONDA.format, size: "grande" } }],
    ["no duration anywhere", { streams: [{ codec_type: "video", width: 1, height: 1 }], format: { size: "10" } }],
  ])("fails with a message for Coni when ffprobe gives %s", (_caso, json) => {
    const error = (() => {
      try {
        infoDesdeFfprobe(json)
      } catch (e) {
        return e
      }
      return null
    })()
    expect(error).toBeInstanceOf(Falla)
    expect(error).toMatchObject({ message: "No pude leer el video que quedó listo. Prueba de nuevo." })
  })
})
