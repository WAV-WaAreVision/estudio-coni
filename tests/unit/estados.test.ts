import { describe, expect, it } from "vitest"
import {
  ArtefactoCambio,
  type Evento,
  type Pieza,
  piezaNueva,
  TransicionInvalida,
  transicionar,
} from "@/lib/dominio/estados"

const HORA = "2026-10-08T22:00:00.000Z" // jueves 8 de octubre, 19:00 en Santiago
const ANTES = "2026-10-06T15:00:00.000Z"

function en(estado: Pieza["estado"], cambios: Partial<Pieza> = {}): Pieza {
  return { ...piezaNueva(), estado, ...cambios }
}

const programada = en("programado", {
  audioId: "audio_1",
  videoId: "video_1",
  puerta1: { hash: "h1", en: ANTES },
  puerta2: { videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: ANTES },
})

const aprobarGuion = (cambios: Partial<Extract<Evento, { tipo: "aprobar_guion" }>> = {}): Evento => ({
  tipo: "aprobar_guion",
  actor: "coni",
  hashVisto: "h1",
  hashActual: "h1",
  en: ANTES,
  ...cambios,
})

const aprobarVideo = (cambios: Partial<Extract<Evento, { tipo: "aprobar_video" }>> = {}): Evento => ({
  tipo: "aprobar_video",
  actor: "coni",
  videoVisto: "video_1",
  hashTextoVisto: "t1",
  hashTextoActual: "t1",
  publicarEn: HORA,
  en: ANTES,
  ...cambios,
})

describe("transicionar", () => {
  it("recorre el camino feliz y sube la versión en cada paso", () => {
    const eventos: Evento[] = [
      { tipo: "elegir" },
      { tipo: "guion_listo", audioId: "audio_1" },
      aprobarGuion(),
      { tipo: "render_entregado" },
      { tipo: "video_listo", videoId: "video_1" },
      aprobarVideo(),
      { tipo: "publicado" },
    ]
    let pieza = piezaNueva()
    for (const evento of eventos) {
      pieza = transicionar(pieza, evento).pieza
    }
    expect(pieza.estado).toBe("publicado")
    expect(pieza.version).toBe(eventos.length)
    expect(pieza.puerta1).toEqual({ hash: "h1", en: ANTES })
    expect(pieza.puerta2).toEqual({ videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: ANTES })
  })

  it("rechaza un evento cuando no corresponde al estado", () => {
    expect(() => transicionar(piezaNueva(), aprobarGuion())).toThrow(TransicionInvalida)
    expect(() => transicionar(en("video_por_aprobar"), { tipo: "publicado" })).toThrow(TransicionInvalida)
    expect(() => transicionar(en("publicado"), { tipo: "descartar" })).toThrow(TransicionInvalida)
    expect(() => transicionar(en("en_render"), { tipo: "editar_texto" })).toThrow(TransicionInvalida)
  })

  it("rechaza la aprobación cuando no la hace coni", () => {
    const pieza = en("guion_por_aprobar", { audioId: "audio_1" })
    expect(() => transicionar(pieza, aprobarGuion({ actor: "sistema" }))).toThrow("Solo Coni puede aprobar")
    expect(() => transicionar(pieza, aprobarGuion({ actor: "admin" }))).toThrow("Solo Coni puede aprobar")
    const video = en("video_por_aprobar", { videoId: "video_1" })
    expect(() => transicionar(video, aprobarVideo({ actor: "sistema" }))).toThrow("Solo Coni puede aprobar")
  })

  it("rechaza la puerta 1 cuando el guion o la voz cambiaron mientras coni revisaba", () => {
    const pieza = en("guion_por_aprobar", { audioId: "audio_1" })
    expect(() => transicionar(pieza, aprobarGuion({ hashActual: "h2" }))).toThrow(ArtefactoCambio)
  })

  it("rechaza la puerta 1 cuando todavía no hay voz", () => {
    expect(() => transicionar(en("guion_por_aprobar"), aprobarGuion())).toThrow(TransicionInvalida)
  })

  it("rechaza la puerta 2 cuando el video, el texto o la hora no sirven", () => {
    const pieza = en("video_por_aprobar", { videoId: "video_1" })
    expect(() => transicionar(pieza, aprobarVideo({ videoVisto: "video_0" }))).toThrow(ArtefactoCambio)
    expect(() => transicionar(pieza, aprobarVideo({ hashTextoActual: "t2" }))).toThrow(ArtefactoCambio)
    expect(() => transicionar(pieza, aprobarVideo({ publicarEn: ANTES }))).toThrow("ya pasó")
  })

  it("borra la voz cuando coni pide cambios al guion", () => {
    const { pieza } = transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), { tipo: "pedir_cambios" })
    expect(pieza.estado).toBe("guion_en_proceso")
    expect(pieza.audioId).toBeNull()
  })

  it("vuelve a la puerta 1 con la explicación cuando heygen rechaza el contenido", () => {
    const pieza = en("en_render", { audioId: "audio_1", puerta1: { hash: "h1", en: ANTES } })
    const { pieza: nueva } = transicionar(pieza, { tipo: "politica_contenido", explicacion: "HeyGen marcó una frase." })
    expect(nueva.estado).toBe("guion_por_aprobar")
    expect(nueva.puerta1).toBeNull()
    expect(nueva.explicacion).toBe("HeyGen marcó una frase.")
  })

  it("regraba con un intento nuevo cuando coni pide regrabar, sin tocar la puerta 1", () => {
    const pieza = en("video_por_aprobar", {
      audioId: "audio_1",
      videoId: "video_1",
      puerta1: { hash: "h1", en: ANTES },
    })
    const { pieza: nueva } = transicionar(pieza, { tipo: "regrabar" })
    expect(nueva.estado).toBe("en_render")
    expect(nueva.videoId).toBeNull()
    expect(nueva.intento).toBe(1)
    expect(nueva.puerta1).toEqual({ hash: "h1", en: ANTES })
  })

  it("borra puerta 1, voz y video cuando coni cambia el guion después del video", () => {
    const pieza = en("video_por_aprobar", {
      audioId: "audio_1",
      videoId: "video_1",
      puerta1: { hash: "h1", en: ANTES },
    })
    const { pieza: nueva } = transicionar(pieza, { tipo: "cambiar_guion" })
    expect(nueva).toMatchObject({ estado: "guion_en_proceso", puerta1: null, audioId: null, videoId: null })
  })

  it("pide revisar el texto sin regrabar cuando coni edita solo el texto de publicación", () => {
    const enGuion = transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), { tipo: "editar_texto" })
    expect(enGuion.pieza.estado).toBe("guion_por_aprobar")
    expect(enGuion.efectos).toEqual(["revisar_texto"])

    const enVideo = transicionar(en("video_por_aprobar", { videoId: "video_1", puerta1: { hash: "h1", en: ANTES } }), {
      tipo: "editar_texto",
    })
    expect(enVideo.pieza).toMatchObject({ estado: "video_por_aprobar", videoId: "video_1", puerta2: null })
    expect(enVideo.pieza.puerta1).toEqual({ hash: "h1", en: ANTES })

    const programado = transicionar(programada, { tipo: "editar_texto" })
    expect(programado.pieza).toMatchObject({ estado: "video_por_aprobar", puerta2: null, videoId: "video_1" })
    expect(programado.efectos).toEqual(["cancelar_publicacion", "revisar_texto"])
  })

  it("cancela la publicación programada cuando coni cambia la fecha", () => {
    const { pieza, efectos } = transicionar(programada, { tipo: "cambiar_fecha" })
    expect(pieza).toMatchObject({ estado: "video_por_aprobar", puerta2: null, intento: 1 })
    expect(efectos).toEqual(["cancelar_publicacion"])
  })

  it("cancela la publicación cuando se descarta una pieza programada", () => {
    const { pieza, efectos } = transicionar(programada, { tipo: "descartar" })
    expect(pieza).toMatchObject({ estado: "descartado", puerta1: null, puerta2: null })
    expect(efectos).toEqual(["cancelar_publicacion"])
    expect(transicionar(en("guion_por_aprobar"), { tipo: "descartar" }).efectos).toEqual([])
  })

  it("vuelve al paso donde falló con un intento nuevo cuando coni reintenta un error de producción", () => {
    const fallida = transicionar(en("subtitulando"), { tipo: "falla_produccion", explicacion: "ffmpeg falló" }).pieza
    expect(fallida).toMatchObject({
      estado: "error_produccion",
      estadoAntesDelError: "subtitulando",
      explicacion: "ffmpeg falló",
    })
    const { pieza } = transicionar(fallida, { tipo: "reintentar", ahora: ANTES })
    expect(pieza).toMatchObject({ estado: "subtitulando", estadoAntesDelError: null, intento: 1, explicacion: null })
  })

  it("vuelve a programado cuando coni reintenta la publicación dentro de los 30 minutos", () => {
    const fallida = transicionar(programada, { tipo: "falla_publicacion", explicacion: "Instagram no respondió" }).pieza
    const { pieza } = transicionar(fallida, { tipo: "reintentar", ahora: "2026-10-08T22:30:00.000Z" })
    expect(pieza).toMatchObject({ estado: "programado", intento: 1 })
    expect(pieza.puerta2?.publicarEn).toBe(HORA)
  })

  it("pide una fecha nueva cuando coni reintenta la publicación con la hora aprobada vencida", () => {
    const fallida = transicionar(programada, { tipo: "falla_publicacion", explicacion: "Instagram no respondió" }).pieza
    const { pieza } = transicionar(fallida, { tipo: "reintentar", ahora: "2026-10-08T22:31:00.000Z" })
    expect(pieza).toMatchObject({ estado: "video_por_aprobar", puerta2: null, intento: 1 })
    expect(pieza.explicacion).toContain("La hora aprobada ya pasó")
  })
})
