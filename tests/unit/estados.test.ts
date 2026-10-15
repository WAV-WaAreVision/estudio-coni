import { describe, expect, expectTypeOf, it } from "vitest"
import { claveGrabar } from "@/lib/acciones/disparos"
import {
  type Actor,
  AprobacionNoAutorizada,
  ArtefactoCambio,
  ESTADOS,
  type Estado,
  type Evento,
  esperaDeVentana,
  instanteEstricto,
  MARGEN_DE_RELOJ_MS,
  type Pieza,
  piezaNueva,
  piezaTrabajando,
  restoDeVentana,
  TEXTO_DESHACER_TARDE,
  type Transicion,
  TransicionInvalida,
  transicionar,
  VENTANA_DESHACER_MS,
} from "@/lib/dominio/estados"
import { Falla } from "@/lib/dominio/falla"
import { TEXTO_SIN_VOZ } from "@/lib/produccion/voz"

const HORA = "2026-10-08T22:00:00.000Z" // jueves 8 de octubre, 19:00 en Santiago
const ANTES = "2026-10-06T15:00:00.000Z"

function en(estado: Pieza["estado"], cambios: Partial<Pieza> = {}): Pieza {
  return { ...piezaNueva(), estado, ...cambios }
}

const programada = en("programado", {
  audioId: "audio_1",
  videoId: "video_1",
  puerta1: { hash: "h1", en: ANTES },
  puerta2: { videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: ANTES, formula: 1 },
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
  formula: 1,
  publicarEn: HORA,
  en: ANTES,
  ...cambios,
})

function capturar(accion: () => unknown): unknown {
  try {
    accion()
  } catch (error) {
    return error
  }
  throw new Error("Se esperaba que lanzara un error.")
}

describe("transicionar", () => {
  it("recorre el camino feliz y sube la versión en cada paso", () => {
    const eventos: Evento[] = [
      { tipo: "elegir" },
      { tipo: "guion_listo", audioId: "audio_1" },
      aprobarGuion(),
      { tipo: "voz_lista", audioId: "audio_1" },
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
    expect(pieza.puerta2).toEqual({ videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: ANTES, formula: 1 })
  })

  it("rechaza un evento cuando no corresponde al estado", () => {
    expect(() => transicionar(piezaNueva(), aprobarGuion())).toThrow(TransicionInvalida)
    expect(() => transicionar(en("video_por_aprobar"), { tipo: "publicado" })).toThrow(TransicionInvalida)
    expect(() => transicionar(en("publicado"), { tipo: "descartar" })).toThrow(TransicionInvalida)
    expect(() => transicionar(en("en_render"), { tipo: "editar_texto" })).toThrow(TransicionInvalida)
  })

  it("rechaza la aprobación cuando no la hace coni", () => {
    const pieza = en("guion_por_aprobar", { audioId: "audio_1" })
    expect(() => transicionar(pieza, aprobarGuion({ actor: "sistema" }))).toThrow(AprobacionNoAutorizada)
    expect(() => transicionar(pieza, aprobarGuion({ actor: "admin" }))).toThrow(AprobacionNoAutorizada)
    const video = en("video_por_aprobar", { videoId: "video_1" })
    expect(() => transicionar(video, aprobarVideo({ actor: "sistema" }))).toThrow(AprobacionNoAutorizada)
  })

  it("trata la aprobación de otro actor como un bug o un evento de seguridad, nunca como un mensaje para coni", () => {
    const error = capturar(() =>
      transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), aprobarGuion({ actor: "admin" })),
    )
    expect(error).toBeInstanceOf(AprobacionNoAutorizada)
    expect(error).not.toBeInstanceOf(Falla)
    // The attempt is flagged even when the piece is in the wrong state, so it is never masked as a stale screen.
    expect(() => transicionar(piezaNueva(), aprobarGuion({ actor: "sistema" }))).toThrow(AprobacionNoAutorizada)
    expect(() => transicionar(piezaNueva(), aprobarVideo({ actor: "sistema" }))).toThrow(AprobacionNoAutorizada)
  })

  it("rechaza la puerta 1 cuando el guion o la voz cambiaron mientras coni revisaba", () => {
    const pieza = en("guion_por_aprobar", { audioId: "audio_1" })
    expect(() => transicionar(pieza, aprobarGuion({ hashActual: "h2" }))).toThrow(ArtefactoCambio)
  })

  it("rechaza la puerta 2 cuando el video, el texto o la hora no sirven", () => {
    const pieza = en("video_por_aprobar", { videoId: "video_1" })
    expect(() => transicionar(pieza, aprobarVideo({ videoVisto: "video_0" }))).toThrow(ArtefactoCambio)
    expect(() => transicionar(pieza, aprobarVideo({ hashTextoActual: "t2" }))).toThrow(ArtefactoCambio)
    expect(() => transicionar(pieza, aprobarVideo({ publicarEn: ANTES }))).toThrow("ya pasó")
  })

  it("rechaza la puerta 2 cuando la hora de publicación no trae zona horaria o no se puede leer", () => {
    const pieza = en("video_por_aprobar", { videoId: "video_1" })
    for (const publicarEn of ["2026-10-08T19:00", "1", "pronto", "2026-02-30T10:00:00Z"]) {
      const error = capturar(() => transicionar(pieza, aprobarVideo({ publicarEn })))
      expect(error, publicarEn).toBeInstanceOf(Falla)
      expect(error, publicarEn).toHaveProperty("message", "La fecha de publicación no es válida.")
    }
  })

  it("stores the formula of the approval so the publish step recomputes the hash the same way", () => {
    const pieza = en("video_por_aprobar", { videoId: "video_1" })
    expect(transicionar(pieza, aprobarVideo({ formula: 2 })).pieza.puerta2?.formula).toBe(2)
    expect(transicionar(pieza, aprobarVideo({ formula: 1 })).pieza.puerta2?.formula).toBe(1)
  })

  it("guarda la hora aprobada normalizada a UTC cuando coni la elige con un desfase explícito", () => {
    const pieza = en("video_por_aprobar", { videoId: "video_1" })
    const { pieza: nueva } = transicionar(pieza, aprobarVideo({ publicarEn: "2026-10-08T19:00:00-03:00" }))
    expect(nueva.puerta2?.publicarEn).toBe("2026-10-08T22:00:00.000Z")
  })

  it("lanza un error común cuando el reloj del servidor trae un instante ilegible", () => {
    const video = en("video_por_aprobar", { videoId: "video_1" })
    const errores = [
      capturar(() => transicionar(video, aprobarVideo({ en: "ahora" }))),
      capturar(() => transicionar(video, aprobarVideo({ en: "2026-10-06T15:00" }))),
      capturar(() =>
        transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), aprobarGuion({ en: "2026-10-06T15:00" })),
      ),
      capturar(() =>
        transicionar(en("error_produccion", { estadoAntesDelError: "en_render" }), { tipo: "reintentar", ahora: "1" }),
      ),
    ]
    for (const error of errores) {
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(Falla)
    }
  })

  it("guarda la hora de la aprobación del guion normalizada a UTC", () => {
    const pieza = en("guion_por_aprobar", { audioId: "audio_1" })
    const { pieza: nueva } = transicionar(pieza, aprobarGuion({ en: "2026-10-06T12:00:00-03:00" }))
    expect(nueva.puerta1).toEqual({ hash: "h1", en: ANTES })
  })

  it("borra la voz y abre un intento nuevo cuando coni pide cambios al guion", () => {
    const { pieza } = transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), { tipo: "pedir_cambios" })
    expect(pieza.estado).toBe("guion_en_proceso")
    expect(pieza.audioId).toBeNull()
    // The new script round must not reuse the spend key of the round that Coni asked to redo.
    expect(pieza.intento).toBe(1)
  })

  it("hands the script over with the voice the writer made", () => {
    const { pieza } = transicionar(en("guion_en_proceso", { explicacion: "Antes falló." }), {
      tipo: "guion_listo",
      audioId: "voces/p/t-h-0.mp3",
    })
    expect(pieza).toMatchObject({ estado: "guion_por_aprobar", audioId: "voces/p/t-h-0.mp3", explicacion: null })
  })

  it("hands the script over without a voice, saying why", () => {
    const { pieza } = transicionar(en("guion_en_proceso"), {
      tipo: "guion_listo",
      audioId: null,
      explicacion: "No pude preparar tu voz.",
    })
    expect(pieza).toMatchObject({ estado: "guion_por_aprobar", audioId: null, explicacion: "No pude preparar tu voz." })
  })

  it("only lets the script arrive without a voice together with the reason", () => {
    expectTypeOf<Extract<Evento, { tipo: "guion_listo" }>>().toEqualTypeOf<
      { tipo: "guion_listo"; audioId: string } | { tipo: "guion_listo"; audioId: null; explicacion: string }
    >()
  })

  it("la firma de la puerta 1 manda la pieza a grabar", () => {
    const { pieza } = transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), aprobarGuion())
    expect(pieza.estado).toBe("en_render")
  })

  it("guarda la voz sin salir de en_render cuando la voz queda lista durante la grabación", () => {
    const { pieza } = transicionar(en("en_render", { puerta1: { hash: "h1", en: ANTES } }), {
      tipo: "voz_lista",
      audioId: "audio_9",
    })
    expect(pieza.estado).toBe("en_render")
    expect(pieza.audioId).toBe("audio_9")
  })

  it("rechaza la voz lista fuera de en_render", () => {
    for (const estado of ["guion_por_aprobar", "subtitulando", "video_por_aprobar"] as const) {
      expect(() => transicionar(en(estado), { tipo: "voz_lista", audioId: "a" })).toThrow(TransicionInvalida)
    }
  })

  it("conserva la voz cuando coni pide regrabar", () => {
    const pieza = en("video_por_aprobar", { audioId: "audio_1", videoId: "video_1" })
    expect(transicionar(pieza, { tipo: "regrabar" }).pieza.audioId).toBe("audio_1")
  })

  it("vuelve a la puerta 1 con la explicación cuando heygen rechaza el contenido", () => {
    const pieza = en("en_render", { audioId: "audio_1", puerta1: { hash: "h1", en: ANTES } })
    const { pieza: nueva } = transicionar(pieza, { tipo: "politica_contenido", explicacion: "HeyGen marcó una frase." })
    expect(nueva.estado).toBe("guion_por_aprobar")
    expect(nueva.puerta1).toBeNull()
    expect(nueva.explicacion).toBe("HeyGen marcó una frase.")
    // Re-approving the same script must not reuse the key of the render that HeyGen refused.
    expect(nueva.intento).toBe(1)
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
    expect(nueva.intento).toBe(1)
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
    // Re-approving the identical caption must not reuse the key of the publish that was cancelled.
    expect(programado.pieza).toMatchObject({
      estado: "video_por_aprobar",
      puerta2: null,
      videoId: "video_1",
      intento: 1,
    })
    expect(programado.efectos).toEqual(["cancelar_publicacion", "revisar_texto"])
  })

  it("keeps the reason when Coni edits only the caption", () => {
    const sinVoz = transicionar(en("guion_por_aprobar", { audioId: null, explicacion: TEXTO_SIN_VOZ }), {
      tipo: "editar_texto",
    })
    expect(sinVoz.pieza).toMatchObject({ estado: "guion_por_aprobar", explicacion: TEXTO_SIN_VOZ })

    const horaVencida = transicionar(programada, { tipo: "hora_vencida" }).pieza
    const enVideo = transicionar(horaVencida, { tipo: "editar_texto" })
    expect(enVideo.pieza).toMatchObject({ estado: "video_por_aprobar", explicacion: horaVencida.explicacion })
    expect(enVideo.pieza.explicacion).toContain("La hora aprobada pasó")

    const programadoConNota = transicionar({ ...programada, explicacion: "Una nota." }, { tipo: "editar_texto" })
    expect(programadoConNota.pieza).toMatchObject({ estado: "video_por_aprobar", explicacion: "Una nota." })
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

  it("cancela la publicación cuando se descarta una pieza con la publicación fallida, por si el proveedor la conserva", () => {
    const fallida = transicionar(programada, { tipo: "falla_publicacion", explicacion: "Metricool no respondió" }).pieza
    expect(transicionar(fallida, { tipo: "descartar" }).efectos).toEqual(["cancelar_publicacion"])
    const producion = transicionar(en("en_render"), { tipo: "falla_produccion", explicacion: "HeyGen falló" }).pieza
    expect(transicionar(producion, { tipo: "descartar" }).efectos).toEqual([])
  })

  it("limpia el origen del error cuando se descarta una pieza fallida, en producción o en publicación", () => {
    const enProduccion = transicionar(en("en_render"), { tipo: "falla_produccion", explicacion: "HeyGen falló" }).pieza
    const enPublicacion = transicionar(programada, { tipo: "falla_publicacion", explicacion: "Metricool falló" }).pieza
    expect(enProduccion.estadoAntesDelError).toBe("en_render")
    expect(enPublicacion.estadoAntesDelError).toBe("programado")

    for (const fallida of [enProduccion, enPublicacion]) {
      expect(transicionar(fallida, { tipo: "descartar" }).pieza).toMatchObject({
        estado: "descartado",
        estadoAntesDelError: null,
      })
    }
  })

  it("deja el origen del error vacío en toda transición que sale de un estado de error", () => {
    const fallidas = [
      transicionar(en("en_render"), { tipo: "falla_produccion", explicacion: "x" }).pieza,
      transicionar(en("subtitulando"), { tipo: "falla_produccion", explicacion: "x" }).pieza,
      transicionar(programada, { tipo: "falla_publicacion", explicacion: "x" }).pieza,
    ]
    const salidas: Evento[] = [{ tipo: "reintentar", ahora: HORA }, { tipo: "descartar" }]
    for (const fallida of fallidas) {
      for (const salida of salidas) {
        expect(transicionar(fallida, salida).pieza.estadoAntesDelError).toBeNull()
      }
    }
  })

  it("pide una fecha nueva y cancela la publicación cuando la hora aprobada pasó sin publicarse", () => {
    const { pieza, efectos } = transicionar(programada, { tipo: "hora_vencida" })
    expect(pieza).toMatchObject({
      estado: "video_por_aprobar",
      puerta2: null,
      videoId: "video_1",
      intento: 1,
      explicacion: "La hora aprobada pasó sin publicarse. Elige una nueva fecha.",
    })
    expect(efectos).toEqual(["cancelar_publicacion"])
    expect(() => transicionar(en("video_por_aprobar"), { tipo: "hora_vencida" })).toThrow(TransicionInvalida)
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

  it("pide una fecha nueva cuando coni reintenta la publicación y la hora aprobada guardada no se puede leer", () => {
    const corrupta = en("error_publicacion", {
      estadoAntesDelError: "programado",
      puerta2: { videoId: "video_1", hashTexto: "t1", publicarEn: "pronto", en: ANTES, formula: 1 },
    })
    const { pieza } = transicionar(corrupta, { tipo: "reintentar", ahora: HORA })
    expect(pieza).toMatchObject({ estado: "video_por_aprobar", puerta2: null })
  })

  it("pide una fecha nueva cuando coni reintenta la publicación con la hora aprobada vencida", () => {
    const fallida = transicionar(programada, { tipo: "falla_publicacion", explicacion: "Instagram no respondió" }).pieza
    const { pieza } = transicionar(fallida, { tipo: "reintentar", ahora: "2026-10-08T22:31:00.000Z" })
    expect(pieza).toMatchObject({ estado: "video_por_aprobar", puerta2: null, intento: 1 })
    expect(pieza.explicacion).toContain("La hora aprobada ya pasó")
  })
})

describe("mensajes y tipos", () => {
  it("avisa a coni sin jerga cuando la pieza cambió mientras la miraba", () => {
    const error = capturar(() => transicionar(piezaNueva(), aprobarGuion()))
    expect(error).toBeInstanceOf(TransicionInvalida)
    expect(error).toHaveProperty("message", "Esta pieza cambió mientras la mirabas. Vuelve a abrirla.")
    expect(error).toMatchObject({ estado: "idea", evento: "aprobar_guion" })
  })

  it("avisa a coni que no quedó aprobado cuando lo que revisaba cambió", () => {
    const error = capturar(() =>
      transicionar(en("guion_por_aprobar", { audioId: "audio_1" }), aprobarGuion({ hashActual: "h2" })),
    )
    expect(error).toBeInstanceOf(ArtefactoCambio)
    expect(error).toHaveProperty(
      "message",
      "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    )
  })

  it("limita el estado anterior al error a los pasos que se pueden reintentar", () => {
    expectTypeOf<Pieza["estadoAntesDelError"]>().toEqualTypeOf<"en_render" | "subtitulando" | "programado" | null>()
  })
})

describe("subir a mano", () => {
  it("entrega la pieza programada para subir sin tocar lo aprobado", () => {
    const { pieza, efectos } = transicionar(programada, { tipo: "entregar_para_subir" })
    expect(pieza).toMatchObject({
      estado: "para_subir_a_mano",
      puerta2: programada.puerta2,
      videoId: "video_1",
      explicacion: null,
      version: programada.version + 1,
    })
    expect(efectos).toEqual([])
  })

  it("deja a la pieza en publicado_a_mano cuando Coni dice que ya la subió", () => {
    const entregada = transicionar(programada, { tipo: "entregar_para_subir" }).pieza
    const { pieza } = transicionar(entregada, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "instagram",
      quedanPendientes: false,
    })
    expect(pieza.estado).toBe("publicado_a_mano")
    expect(pieza.puerta2).toEqual(programada.puerta2)
  })

  it("permite marcarla como subida antes de la hora y retira la publicación programada", () => {
    const { pieza, efectos } = transicionar(programada, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "instagram",
      quedanPendientes: false,
    })
    expect(pieza.estado).toBe("publicado_a_mano")
    expect(efectos).toEqual(["cancelar_publicacion"])
  })

  it("handles one destination marked while another is still pending: the piece keeps its state", () => {
    const entregada = transicionar(programada, { tipo: "entregar_para_subir" }).pieza
    const { pieza, efectos } = transicionar(entregada, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "instagram",
      quedanPendientes: true,
    })
    expect(pieza.estado).toBe("para_subir_a_mano")
    expect(pieza.puerta2).toEqual(programada.puerta2)
    expect(pieza.version).toBe(entregada.version + 1)
    expect(efectos).toEqual([])
  })

  it("handles the last destination marked: the piece is publicado_a_mano", () => {
    const entregada = transicionar(programada, { tipo: "entregar_para_subir" }).pieza
    const { pieza } = transicionar(entregada, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "linkedin",
      quedanPendientes: false,
    })
    expect(pieza.estado).toBe("publicado_a_mano")
  })

  it("handles an early mark with pendings left when programado: no cancel, still programado", () => {
    const { pieza, efectos } = transicionar(programada, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "linkedin",
      quedanPendientes: true,
    })
    expect(pieza.estado).toBe("programado")
    expect(efectos).toEqual([])
  })

  it("handles the last early mark when programado: the scheduled publication is cancelled", () => {
    const { pieza, efectos } = transicionar(programada, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "linkedin",
      quedanPendientes: false,
    })
    expect(pieza.estado).toBe("publicado_a_mano")
    expect(efectos).toEqual(["cancelar_publicacion"])
  })

  it("only lets Coni mark a destination even when others are pending", () => {
    const entregada = transicionar(programada, { tipo: "entregar_para_subir" }).pieza
    expect(() =>
      transicionar(entregada, { tipo: "subido_a_mano", actor: "sistema", destino: "linkedin", quedanPendientes: true }),
    ).toThrow(AprobacionNoAutorizada)
  })

  it("handles Instagram published by the API when LinkedIn waits: para_subir_a_mano", () => {
    const { pieza } = transicionar(programada, { tipo: "publicado", quedanAMano: true })
    expect(pieza.estado).toBe("para_subir_a_mano")
    expect(pieza.puerta2).toEqual(programada.puerta2)
  })

  it("handles Instagram published by the API when nothing waits: publicado", () => {
    expect(transicionar(programada, { tipo: "publicado" }).pieza.estado).toBe("publicado")
    expect(transicionar(programada, { tipo: "publicado", quedanAMano: false }).pieza.estado).toBe("publicado")
  })

  it("handles the whole mixed path: Instagram by the API, then LinkedIn by hand", () => {
    const esperando = transicionar(programada, { tipo: "publicado", quedanAMano: true }).pieza
    const { pieza } = transicionar(esperando, {
      tipo: "subido_a_mano",
      actor: "coni",
      destino: "linkedin",
      quedanPendientes: false,
    })
    expect(pieza.estado).toBe("publicado_a_mano")
  })

  it("solo deja que Coni la marque como subida", () => {
    for (const actor of ["sistema", "admin"] as const) {
      expect(() =>
        transicionar(programada, { tipo: "subido_a_mano", actor, destino: "instagram", quedanPendientes: false }),
      ).toThrow(AprobacionNoAutorizada)
    }
  })

  it("no admite entregar para subir una pieza que ya salió o que está en error", () => {
    expect(() => transicionar(en("error_publicacion"), { tipo: "entregar_para_subir" })).toThrow(TransicionInvalida)
    expect(() => transicionar(en("publicado"), { tipo: "entregar_para_subir" })).toThrow(TransicionInvalida)
  })
})

describe("instanteEstricto", () => {
  it("acepta solo instantes con Z o con desfase explícito y los normaliza a UTC", () => {
    expect(instanteEstricto("2026-10-08T22:00:00Z")).toBe(HORA)
    expect(instanteEstricto("2026-10-08T19:00:00-03:00")).toBe(HORA)
    expect(instanteEstricto("2026-10-08T22:00Z")).toBe(HORA)
    expect(instanteEstricto("2026-10-08T22:00:00.5Z")).toBe("2026-10-08T22:00:00.500Z")
  })

  it("rechaza fechas sin zona horaria, números sueltos, fechas imposibles y texto cualquiera", () => {
    const ilegibles = [
      "2026-10-08T19:00",
      "2026-10-08T19:00:00",
      "2026-10-08",
      "1",
      "",
      "pronto",
      "2026-02-30T10:00:00Z",
      "2026-10-08T24:00:00Z",
      "2026-10-08 22:00:00Z",
    ]
    for (const texto of ilegibles) {
      expect(instanteEstricto(texto), texto).toBeNull()
    }
  })
})

// Expected from the design doc's "Estados y transiciones" table (+ hora_vencida and the caption-only edits),
// not derived from the implementation.
describe("tabla del diseño", () => {
  const permitidos: Record<Estado, readonly Evento["tipo"][]> = {
    idea: ["elegir", "descartar"],
    guion_en_proceso: ["guion_listo", "descartar"],
    guion_por_aprobar: ["pedir_cambios", "editar_texto", "aprobar_guion", "pedir_voz", "descartar"],
    guion_aprobado: ["descartar"],
    grabando_voz: ["voz_lista", "falla_voz", "descartar"],
    en_render: [
      "voz_lista",
      "render_entregado",
      "politica_contenido",
      "falla_produccion",
      "deshacer_aprobacion",
      "descartar",
    ],
    subtitulando: ["video_listo", "falla_produccion", "descartar"],
    video_por_aprobar: ["aprobar_video", "regrabar", "cambiar_guion", "editar_texto", "descartar"],
    programado: [
      "publicado",
      "cambiar_fecha",
      "falla_publicacion",
      "hora_vencida",
      "editar_texto",
      "entregar_para_subir",
      "subido_a_mano",
      "descartar",
    ],
    para_subir_a_mano: ["subido_a_mano", "descartar"],
    publicado: [],
    publicado_a_mano: [],
    error_produccion: ["reintentar", "descartar"],
    error_publicacion: ["reintentar", "descartar"],
    descartado: [],
  }

  const eventos: Record<Evento["tipo"], Evento> = {
    elegir: { tipo: "elegir" },
    guion_listo: { tipo: "guion_listo", audioId: "audio_2" },
    voz_lista: { tipo: "voz_lista", audioId: "audio_2" },
    pedir_cambios: { tipo: "pedir_cambios" },
    editar_texto: { tipo: "editar_texto" },
    aprobar_guion: aprobarGuion(),
    pedir_voz: { tipo: "pedir_voz" },
    falla_voz: { tipo: "falla_voz", explicacion: "ElevenLabs falló" },
    render_entregado: { tipo: "render_entregado" },
    politica_contenido: { tipo: "politica_contenido", explicacion: "HeyGen marcó una frase." },
    falla_produccion: { tipo: "falla_produccion", explicacion: "HeyGen falló" },
    video_listo: { tipo: "video_listo", videoId: "video_2" },
    aprobar_video: aprobarVideo(),
    regrabar: { tipo: "regrabar" },
    cambiar_guion: { tipo: "cambiar_guion" },
    cambiar_fecha: { tipo: "cambiar_fecha" },
    publicado: { tipo: "publicado" },
    falla_publicacion: { tipo: "falla_publicacion", explicacion: "Metricool no respondió" },
    hora_vencida: { tipo: "hora_vencida" },
    entregar_para_subir: { tipo: "entregar_para_subir" },
    subido_a_mano: { tipo: "subido_a_mano", actor: "coni", destino: "instagram", quedanPendientes: false },
    reintentar: { tipo: "reintentar", ahora: "2026-10-08T22:10:00.000Z" },
    deshacer_aprobacion: { tipo: "deshacer_aprobacion", actor: "coni", ahora: "2026-10-06T15:00:03.000Z" },
    descartar: { tipo: "descartar" },
  }

  const puerta1 = { hash: "h1", en: ANTES }
  const puerta2 = { videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: ANTES, formula: 1 as const }
  const avance = { version: 4, intento: 2 }
  const piezas: Record<Estado, Pieza> = {
    idea: en("idea", avance),
    guion_en_proceso: en("guion_en_proceso", avance),
    guion_por_aprobar: en("guion_por_aprobar", { ...avance, audioId: "audio_1" }),
    guion_aprobado: en("guion_aprobado", { ...avance, puerta1 }),
    grabando_voz: en("grabando_voz", { ...avance, audioId: "audio_1" }),
    en_render: en("en_render", { ...avance, audioId: "audio_1", puerta1 }),
    subtitulando: en("subtitulando", { ...avance, audioId: "audio_1", puerta1 }),
    video_por_aprobar: en("video_por_aprobar", { ...avance, audioId: "audio_1", videoId: "video_1", puerta1 }),
    programado: en("programado", { ...avance, audioId: "audio_1", videoId: "video_1", puerta1, puerta2 }),
    para_subir_a_mano: en("para_subir_a_mano", { ...avance, audioId: "audio_1", videoId: "video_1", puerta1, puerta2 }),
    publicado: en("publicado", { ...avance, audioId: "audio_1", videoId: "video_1", puerta1, puerta2 }),
    publicado_a_mano: en("publicado_a_mano", { ...avance, audioId: "audio_1", videoId: "video_1", puerta1, puerta2 }),
    error_produccion: en("error_produccion", {
      ...avance,
      audioId: "audio_1",
      puerta1,
      estadoAntesDelError: "en_render",
    }),
    error_publicacion: en("error_publicacion", {
      ...avance,
      audioId: "audio_1",
      videoId: "video_1",
      puerta1,
      puerta2,
      estadoAntesDelError: "programado",
    }),
    descartado: en("descartado", avance),
  }

  function intentar(pieza: Pieza, evento: Evento): Transicion | null {
    try {
      return transicionar(pieza, evento)
    } catch (error) {
      if (error instanceof TransicionInvalida) return null
      throw error
    }
  }

  it("acepta solo los eventos de la tabla del diseño", () => {
    for (const estado of ESTADOS) {
      const pieza = piezas[estado]
      const aceptados: Evento["tipo"][] = []
      for (const evento of Object.values(eventos)) {
        const antes = structuredClone(pieza)
        const resultado = intentar(pieza, evento)
        expect(pieza, `${estado} + ${evento.tipo} no debe mutar la pieza`).toEqual(antes)
        if (resultado) {
          aceptados.push(evento.tipo)
          expect(resultado.pieza.version, `${estado} + ${evento.tipo}`).toBe(pieza.version + 1)
        }
      }
      expect(aceptados.sort(), estado).toEqual([...permitidos[estado]].sort())
    }
  })
})

const APROBADA = { hash: "a".repeat(64), en: "2026-10-04T12:00:00.000Z" }
const enCurso = (estado: Pieza["estado"], cambios: Partial<Pieza> = {}): Pieza =>
  en(estado, { version: 4, intento: 2, ...cambios })

describe("la voz antes de la firma", () => {
  const firmar = (instante: string = APROBADA.en): Evento => ({
    tipo: "aprobar_guion",
    actor: "coni",
    hashVisto: APROBADA.hash,
    hashActual: APROBADA.hash,
    en: instante,
  })

  it("signs straight into en_render, keeping the voice she heard and the attempt", () => {
    const { pieza } = transicionar(
      enCurso("guion_por_aprobar", { audioId: "voces/x.mp3", explicacion: "Antes." }),
      firmar(),
    )
    expect(pieza).toMatchObject({
      estado: "en_render",
      puerta1: APROBADA,
      audioId: "voces/x.mp3",
      intento: 2,
      version: 5,
      explicacion: null,
    })
  })

  it("asks for the voice before the signature as a new attempt and clears an old explanation", () => {
    const { pieza } = transicionar(enCurso("guion_por_aprobar", { explicacion: "falló" }), { tipo: "pedir_voz" })
    expect(pieza).toMatchObject({ estado: "grabando_voz", intento: 3, explicacion: null, puerta1: null })
  })

  it("comes back to guion_por_aprobar with the voice, or with the reason and a new attempt when it failed", () => {
    const grabando = enCurso("grabando_voz")
    expect(transicionar(grabando, { tipo: "voz_lista", audioId: "voces/v.mp3" }).pieza).toMatchObject({
      estado: "guion_por_aprobar",
      audioId: "voces/v.mp3",
      intento: 2,
    })
    expect(transicionar(grabando, { tipo: "falla_voz", explicacion: "Sin caracteres." }).pieza).toMatchObject({
      estado: "guion_por_aprobar",
      explicacion: "Sin caracteres.",
      intento: 3,
    })
  })

  it("still stores the voice while in render", () => {
    const { pieza } = transicionar(enCurso("en_render", { puerta1: APROBADA }), {
      tipo: "voz_lista",
      audioId: "voces/v.mp3",
    })
    expect(pieza).toMatchObject({ estado: "en_render", audioId: "voces/v.mp3" })
  })

  it("refuses the voice events and the signature from the wrong states", () => {
    expect(() => transicionar(enCurso("en_render", { puerta1: APROBADA }), { tipo: "pedir_voz" })).toThrow(
      TransicionInvalida,
    )
    expect(() => transicionar(enCurso("grabando_voz"), { tipo: "pedir_voz" })).toThrow(TransicionInvalida)
    expect(() => transicionar(enCurso("grabando_voz"), firmar())).toThrow(TransicionInvalida)
    expect(() => transicionar(enCurso("guion_por_aprobar"), { tipo: "falla_voz", explicacion: "x" })).toThrow(
      TransicionInvalida,
    )
    expect(() => transicionar(enCurso("guion_por_aprobar"), { tipo: "voz_lista", audioId: "v" })).toThrow(
      TransicionInvalida,
    )
  })

  it("edits the caption inside gate 1 without touching the voice", () => {
    const editado = transicionar(enCurso("guion_por_aprobar", { audioId: "voces/x.mp3" }), { tipo: "editar_texto" })
    expect(editado.pieza).toMatchObject({ estado: "guion_por_aprobar", audioId: "voces/x.mp3", intento: 2 })
    expect(editado.efectos).toEqual(["revisar_texto"])
  })

  it("lets Coni discard a piece while her voice is being made", () => {
    expect(transicionar(enCurso("grabando_voz"), { tipo: "descartar" }).pieza.estado).toBe("descartado")
  })
})

describe("piezaTrabajando", () => {
  it("is true while a task works on the piece and false otherwise", () => {
    expect(piezaTrabajando({ estado: "guion_en_proceso", explicacion: null })).toBe(true)
    expect(piezaTrabajando({ estado: "guion_en_proceso", explicacion: "No pude." })).toBe(false)
    for (const estado of ["grabando_voz", "en_render", "subtitulando"] as const) {
      expect(piezaTrabajando({ estado, explicacion: null })).toBe(true)
    }
    // A render stopped by the monthly cap keeps its state but waits for Coni: nothing to poll for.
    for (const estado of ["en_render", "subtitulando"] as const) {
      expect(piezaTrabajando({ estado, explicacion: "Llegaste al tope." })).toBe(false)
    }
    for (const estado of ["guion_por_aprobar", "guion_aprobado", "video_por_aprobar", "error_produccion"] as const) {
      expect(piezaTrabajando({ estado, explicacion: null })).toBe(false)
    }
  })
})

describe("publicado when the last automatic destination closes a mixed piece", () => {
  it("handles algunoAMano when nothing remains by hand: the piece is publicado_a_mano", () => {
    expect(transicionar(programada, { tipo: "publicado", algunoAMano: true }).pieza.estado).toBe("publicado_a_mano")
  })

  it("keeps para_subir_a_mano when something is still by hand, whatever algunoAMano says", () => {
    expect(transicionar(programada, { tipo: "publicado", quedanAMano: true, algunoAMano: true }).pieza.estado).toBe(
      "para_subir_a_mano",
    )
  })

  it("is publicado when every destination was automatic", () => {
    expect(transicionar(programada, { tipo: "publicado" }).pieza.estado).toBe("publicado")
  })
})

describe("la ventana para deshacer la firma", () => {
  const FIRMA = "2026-10-15T12:00:00.000Z"
  const mas = (ms: number) => new Date(Date.parse(FIRMA) + ms).toISOString()

  it("is 8 s, and the render adds 2 s of clock margin", () => {
    expect(VENTANA_DESHACER_MS).toBe(8000)
    expect(MARGEN_DE_RELOJ_MS).toBe(2000)
  })

  it("leaves what is left of the 8 s and closes at exactly 8 s", () => {
    expect(restoDeVentana(FIRMA, FIRMA)).toBe(8000)
    expect(restoDeVentana(FIRMA, mas(7999))).toBe(1)
    expect(restoDeVentana(FIRMA, mas(8000))).toBe(0)
    expect(restoDeVentana(FIRMA, mas(60_000))).toBe(0)
  })

  it("makes the render wait the window plus the margin, measured on its own clock", () => {
    expect(esperaDeVentana(FIRMA, FIRMA)).toBe(10_000)
    expect(esperaDeVentana(FIRMA, mas(3000))).toBe(7000)
    expect(esperaDeVentana(FIRMA, mas(10_000))).toBe(0)
    expect(esperaDeVentana(FIRMA, mas(-5000))).toBe(15_000)
  })

  it("refuses an unreadable instant instead of skipping the wait", () => {
    expect(() => esperaDeVentana("ayer", FIRMA)).toThrow(/Instante inválido/)
    expect(() => restoDeVentana(FIRMA, "")).toThrow(/Instante inválido/)
  })
})

describe("deshacer la firma", () => {
  const FIRMA = { hash: "a".repeat(64), en: "2026-10-15T12:00:00.000Z" }
  const firmada = en("en_render", {
    version: 6,
    intento: 3,
    audioId: "voces/t.mp3",
    puerta1: FIRMA,
    explicacion: "Se acabó el tope.",
  })
  const deshacer = (ms: number, actor: Actor = "coni"): Evento => ({
    tipo: "deshacer_aprobacion",
    actor,
    ahora: new Date(Date.parse(FIRMA.en) + ms).toISOString(),
  })

  it("takes the signature back inside the window, keeping her voice and opening a new attempt", () => {
    const { pieza, efectos } = transicionar(firmada, deshacer(7999))
    expect(pieza).toMatchObject({
      estado: "guion_por_aprobar",
      puerta1: null,
      audioId: "voces/t.mp3",
      intento: 4,
      version: 7,
      explicacion: null,
    })
    expect(efectos).toEqual([])
  })

  it("signs the same text again under another render key, because the undone run is already finished", () => {
    const { pieza: deshecha } = transicionar(firmada, deshacer(1000))
    const claveDe = (intento: number) => claveGrabar({ id: "p", version: 1, intento, puerta1_hash: FIRMA.hash })

    expect(claveDe(deshecha.intento)).not.toBe(claveDe(firmada.intento))
  })

  it("refuses at 8 s with a text for Coni, not as a stale screen", () => {
    const error = capturar(() => transicionar(firmada, deshacer(8000)))
    expect(error).toBeInstanceOf(Falla)
    expect(error).not.toBeInstanceOf(TransicionInvalida)
    expect(error).toMatchObject({ message: TEXTO_DESHACER_TARDE })
    expect(TEXTO_DESHACER_TARDE).toBe("Ya empecé a grabar el video. Puedes revisarlo cuando esté listo.")
  })

  it("only lets Coni undo, and checks the actor before the state", () => {
    expect(() => transicionar(firmada, deshacer(1000, "sistema"))).toThrow(AprobacionNoAutorizada)
    expect(() => transicionar(en("guion_por_aprobar"), deshacer(1000, "sistema"))).toThrow(AprobacionNoAutorizada)
    expect(() => transicionar(en("guion_por_aprobar"), deshacer(1000, "admin"))).toThrow(AprobacionNoAutorizada)
  })

  it("refuses from any state other than a signed piece in render", () => {
    expect(() => transicionar(en("guion_por_aprobar"), deshacer(1000))).toThrow(TransicionInvalida)
    expect(() => transicionar(en("subtitulando", { puerta1: FIRMA }), deshacer(1000))).toThrow(TransicionInvalida)
    expect(() => transicionar(en("en_render"), deshacer(1000))).toThrow(TransicionInvalida)
  })
})
