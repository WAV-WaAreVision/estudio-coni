import { describe, expect, it } from "vitest"
import { construirInicio, type PiezaDeInicio, TEXTO_ENTRA_A_LA_PIEZA } from "@/lib/inicio/modelo"

const ZONA = "America/Santiago"
// Wednesday 7 October 2026, 12:00 in Santiago.
const AHORA = Date.parse("2026-10-07T15:00:00Z")
const GUION = "palabra ".repeat(115).trim()

let contador = 0
function pieza(estado: PiezaDeInicio["estado"], extra: Partial<PiezaDeInicio> = {}): PiezaDeInicio {
  contador += 1
  return {
    id: `pieza-${contador}`,
    titulo: `Título ${contador}`,
    estado,
    explicacion: null,
    guion: GUION,
    pilar: "deseo",
    publicarEn: null,
    permalink: null,
    actualizadaEn: "2026-10-07T14:00:00Z",
    destinos: ["instagram"] as const,
    pendientes: [],
    ...extra,
  }
}

describe("construirInicio", () => {
  it("lists what needs her signature with a link and what signing it takes", () => {
    const guion = pieza("guion_por_aprobar")
    const video = pieza("video_por_aprobar")

    const inicio = construirInicio({ piezas: [guion, video], ahora: AHORA, zona: ZONA })

    expect(inicio.firma).toEqual([
      {
        id: guion.id,
        titulo: guion.titulo,
        pilar: "deseo",
        meta: "Guion · 46 s",
        href: `/guion/${guion.id}`,
        instruccion: "Escucha tu voz y revisa el guion.",
      },
      {
        id: video.id,
        titulo: video.titulo,
        pilar: "deseo",
        meta: "Video · 46 s",
        href: `/video/${video.id}`,
        instruccion: "Mira el video, revisa el texto y elige la fecha.",
      },
    ])
  })

  it("answers with what waits for her signature and about how long it takes", () => {
    const respuesta = (piezas: PiezaDeInicio[]) => {
      const inicio = construirInicio({ piezas, ahora: AHORA, zona: ZONA })
      return [inicio.titulo, inicio.linea]
    }
    expect(respuesta([])).toEqual(["Esta semana está al día", null])
    expect(respuesta([pieza("guion_por_aprobar")])).toEqual(["Una espera tu firma", "unos 3 min"])
    expect(respuesta([pieza("guion_por_aprobar"), pieza("video_por_aprobar")])).toEqual([
      "2 esperan tu firma",
      "unos 6 min",
    ])
  })

  it("keeps a voice being made out of the count, under 'En preparación'", () => {
    const preparando = pieza("grabando_voz")
    const inicio = construirInicio({
      piezas: [pieza("video_por_aprobar"), pieza("guion_por_aprobar"), preparando],
      ahora: AHORA,
      zona: ZONA,
    })

    expect(inicio.titulo).toBe("2 esperan tu firma")
    expect(inicio.linea).toBe("1 en preparación · unos 6 min")
    expect(inicio.firma.map((fila) => fila.id)).not.toContain(preparando.id)
    expect(inicio.enPreparacion).toEqual([
      { id: preparando.id, titulo: preparando.titulo, pilar: "deseo", meta: "Preparando la voz" },
    ])
  })

  it("says only what is in preparation when nothing can be signed yet", () => {
    const inicio = construirInicio({ piezas: [pieza("grabando_voz")], ahora: AHORA, zona: ZONA })
    expect([inicio.titulo, inicio.linea]).toEqual(["Esta semana está al día", "1 en preparación"])
  })

  it("puts failures first: the title counts them and the line says what waits after", () => {
    const fallida = pieza("error_produccion", { explicacion: "HeyGen no pudo terminar el video." })
    const una = construirInicio({ piezas: [fallida, pieza("video_por_aprobar")], ahora: AHORA, zona: ZONA })
    expect([una.titulo, una.linea]).toEqual(["Una cosa necesita tu atención", "Después, una espera tu firma."])

    const dos = construirInicio({
      piezas: [fallida, pieza("error_publicacion"), pieza("guion_por_aprobar"), pieza("video_por_aprobar")],
      ahora: AHORA,
      zona: ZONA,
    })
    expect([dos.titulo, dos.linea]).toEqual(["2 cosas necesitan tu atención", "Después, 2 esperan tu firma."])

    expect(construirInicio({ piezas: [fallida], ahora: AHORA, zona: ZONA }).linea).toBeNull()
  })

  it("orders the failures by what matters most, each with its cause and today's action", () => {
    const fecha = pieza("video_por_aprobar", { explicacion: "La hora aprobada pasó sin publicarse." })
    const escrito = pieza("guion_en_proceso", { explicacion: "Llegaste al tope de gasto de este mes." })
    const frase = pieza("guion_por_aprobar", { explicacion: "HeyGen marcó una frase como sensible." })
    const video = pieza("error_produccion")
    const publicar = pieza("error_publicacion", { explicacion: "LinkedIn no respondió." })

    const { atencion } = construirInicio({ piezas: [fecha, escrito, frase, video, publicar], ahora: AHORA, zona: ZONA })

    expect(atencion.map((aviso) => [aviso.titulo, aviso.causa])).toEqual([
      [publicar.titulo, "No pude publicar."],
      [video.titulo, "No pude terminar el video."],
      [frase.titulo, "Tu guion necesita atención."],
      [escrito.titulo, "No pude escribir el guion."],
      [fecha.titulo, "Elige otra fecha."],
    ])
    expect(atencion[1]).toEqual({
      tipo: "error",
      titulo: video.titulo,
      texto: "Algo no salió como esperábamos con esta pieza.",
      causa: "No pude terminar el video.",
      pilar: "deseo",
      accion: { etiqueta: "Revisar", href: `/guion/${video.id}` },
    })
    expect(atencion[0]?.accion).toEqual({ etiqueta: "Revisar", href: `/video/${publicar.id}` })
    expect(atencion[4]?.accion).toEqual({ etiqueta: "Elegir otra fecha", href: `/video/${fecha.id}` })
  })

  it("shows a script HeyGen sent back once, under attention, and not again in the signature list", () => {
    const devuelta = pieza("guion_por_aprobar", { explicacion: "HeyGen marcó una frase como sensible." })
    const inicio = construirInicio({ piezas: [devuelta], ahora: AHORA, zona: ZONA })
    expect(inicio.atencion).toHaveLength(1)
    expect(inicio.firma).toEqual([])
  })

  it("does not say something else waits when the only signable piece is the one under attention", () => {
    const otraFecha = pieza("video_por_aprobar", { explicacion: "La fecha que elegiste ya pasó." })
    const inicio = construirInicio({ piezas: [otraFecha], ahora: AHORA, zona: ZONA })
    expect([inicio.titulo, inicio.linea]).toEqual(["Una cosa necesita tu atención", null])
    expect(inicio.firma).toEqual([])
  })

  it("shows what is on its way, each row opening its screen", () => {
    const escribiendo = pieza("guion_en_proceso")
    const grabando = pieza("en_render")
    const programada = pieza("programado", { publicarEn: "2026-10-10T22:00:00Z" })

    const { camino } = construirInicio({ piezas: [escribiendo, grabando, programada], ahora: AHORA, zona: ZONA })

    expect(camino.map((fila) => [fila.id, fila.estado, fila.ocupada, fila.href])).toEqual([
      [escribiendo.id, "Escribiendo el guion · te aviso", true, `/guion/${escribiendo.id}`],
      [grabando.id, "Grabando · unos 5 min · te aviso", true, `/guion/${grabando.id}`],
      [programada.id, "Programado · sábado 10 · 19:00", false, `/video/${programada.id}`],
    ])
  })

  it("puts what is scheduled in date order", () => {
    const tarde = pieza("programado", { publicarEn: "2026-10-13T22:00:00Z" })
    const temprano = pieza("programado", { publicarEn: "2026-10-10T22:00:00Z" })

    const { camino } = construirInicio({ piezas: [tarde, temprano], ahora: AHORA, zona: ZONA })

    expect(camino.map((fila) => fila.id)).toEqual([temprano.id, tarde.id])
  })

  it("leaves a script that could not be written out of what is on its way", () => {
    const sinGuion = pieza("guion_en_proceso", { explicacion: "Llegaste al tope de gasto de este mes." })
    const { atencion, camino } = construirInicio({ piezas: [sinGuion], ahora: AHORA, zona: ZONA })
    expect(atencion[0]).toMatchObject({ tipo: "error", texto: "Llegaste al tope de gasto de este mes." })
    expect(camino).toEqual([])
  })

  it("celebrates the last piece published in the last two days, with the way to Instagram", () => {
    const vieja = pieza("publicado", { actualizadaEn: "2026-10-01T22:00:00Z" })
    const reciente = pieza("publicado", {
      actualizadaEn: "2026-10-07T14:00:00Z",
      permalink: "https://www.instagram.com/reel/abc/",
    })

    const { avisos } = construirInicio({ piezas: [vieja, reciente], ahora: AHORA, zona: ZONA })

    expect(avisos).toEqual([
      {
        tipo: "ok",
        titulo: `${reciente.titulo} se publicó hoy a las 11:00`,
        texto: "La etiqueta de IA quedó puesta en Instagram.",
        accion: { etiqueta: "Ver en Instagram", href: "https://www.instagram.com/reel/abc/", externo: true },
      },
    ])
  })

  it("does not list discarded pieces anywhere", () => {
    const inicio = construirInicio({ piezas: [pieza("descartado"), pieza("idea")], ahora: AHORA, zona: ZONA })
    expect(inicio.firma).toEqual([])
    expect(inicio.camino).toEqual([])
    expect(inicio.atencion).toEqual([])
    expect(inicio.avisos).toEqual([])
  })

  it("names the week", () => {
    expect(construirInicio({ piezas: [], ahora: AHORA, zona: ZONA }).semana).toBe("Semana del 5 al 11 de octubre")
  })
})

describe("construirInicio: subir a mano", () => {
  it("lists what waits for her to upload, the oldest first, with the way to the screen that has the tools", () => {
    const tarde = pieza("para_subir_a_mano", { publicarEn: "2026-10-06T22:00:00Z" })
    const antes = pieza("para_subir_a_mano", { publicarEn: "2026-10-03T22:00:00Z" })

    const inicio = construirInicio({ piezas: [tarde, antes], ahora: AHORA, zona: ZONA })

    expect(inicio.porSubir).toEqual([
      {
        id: antes.id,
        titulo: antes.titulo,
        pilar: "deseo",
        meta: "Para subir a Instagram · sábado 3 · 19:00",
        href: `/video/${antes.id}`,
      },
      {
        id: tarde.id,
        titulo: tarde.titulo,
        pilar: "deseo",
        meta: "Para subir a Instagram · martes 6 · 19:00",
        href: `/video/${tarde.id}`,
      },
    ])
  })

  it("does not count them as a signature or as something on its way", () => {
    const inicio = construirInicio({
      piezas: [pieza("para_subir_a_mano", { publicarEn: "2026-10-06T22:00:00Z" })],
      ahora: AHORA,
      zona: ZONA,
    })

    expect(inicio.firma).toEqual([])
    expect(inicio.camino).toEqual([])
    expect(inicio.titulo).toBe("Esta semana está al día")
    expect(inicio.avisos).toEqual([])
  })

  it("confirms a reel she uploaded in the last two days as 'Subido a mano', with her link when she pasted it", () => {
    const vieja = pieza("publicado_a_mano", { actualizadaEn: "2026-10-01T22:00:00Z" })
    const reciente = pieza("publicado_a_mano", {
      actualizadaEn: "2026-10-07T14:00:00Z",
      permalink: "https://www.instagram.com/reel/abc/",
    })

    const { avisos } = construirInicio({ piezas: [vieja, reciente], ahora: AHORA, zona: ZONA })

    expect(avisos).toEqual([
      {
        tipo: "ok",
        titulo: `${reciente.titulo}: subido a mano hoy a las 11:00`,
        texto: "Quedó anotado como subido por ti, con la etiqueta de IA.",
        accion: { etiqueta: "Ver en Instagram", href: "https://www.instagram.com/reel/abc/", externo: true },
      },
    ])
  })

  it("confirms one uploaded without a link and offers nothing to open", () => {
    const sinEnlace = pieza("publicado_a_mano", { actualizadaEn: "2026-10-07T14:00:00Z" })

    const { avisos } = construirInicio({ piezas: [sinEnlace], ahora: AHORA, zona: ZONA })

    expect(avisos).toHaveLength(1)
    expect(avisos[0]).not.toHaveProperty("accion")
  })
})

describe("construirInicio: destinos", () => {
  const paraSubir = (pendientes: PiezaDeInicio["pendientes"], extra: Partial<PiezaDeInicio> = {}) =>
    pieza("para_subir_a_mano", {
      publicarEn: "2026-10-06T22:00:00Z",
      destinos: ["instagram", "linkedin"],
      pendientes,
      ...extra,
    })

  it("says where each reel waits: only LinkedIn, or both", () => {
    const soloLinkedin = paraSubir(["linkedin"], { publicarEn: "2026-10-03T22:00:00Z" })
    const ambos = paraSubir(["instagram", "linkedin"])

    const inicio = construirInicio({ piezas: [ambos, soloLinkedin], ahora: AHORA, zona: ZONA })

    expect(inicio.porSubir.map((fila) => fila.meta)).toEqual([
      "Para subir a LinkedIn · sábado 3 · 19:00",
      "Para subir a Instagram y LinkedIn · martes 6 · 19:00",
    ])
  })

  it("titles the section with every network that waits", () => {
    const titulo = (piezas: PiezaDeInicio[]) => construirInicio({ piezas, ahora: AHORA, zona: ZONA }).porSubirTitulo
    expect(titulo([paraSubir(["instagram"], { destinos: ["instagram"] })])).toBe("Para subir a Instagram")
    expect(titulo([paraSubir(["linkedin"])])).toBe("Para subir a LinkedIn")
    expect(titulo([paraSubir(["instagram"]), paraSubir(["linkedin"])])).toBe("Para subir a Instagram y LinkedIn")
    expect(titulo([])).toBe("Para subir")
  })

  it("falls back to the destinations when no row says what is pending", () => {
    const inicio = construirInicio({ piezas: [paraSubir([])], ahora: AHORA, zona: ZONA })
    expect(inicio.porSubir[0]?.meta).toMatch(/^Para subir a Instagram y LinkedIn/)
  })

  it("celebrates a piece that reached publicado_a_mano with LinkedIn without claiming the Instagram label", () => {
    const solo = pieza("publicado_a_mano", { destinos: ["linkedin"], actualizadaEn: "2026-10-07T14:00:00Z" })

    const { avisos } = construirInicio({ piezas: [solo], ahora: AHORA, zona: ZONA })

    expect(avisos[0]).toMatchObject({
      tipo: "ok",
      texto: "Quedó anotado como subido por ti a LinkedIn.",
    })
    expect(avisos[0]).not.toHaveProperty("accion")
  })

  it("keeps the Instagram wording when Instagram was one of the destinations", () => {
    const ambos = pieza("publicado_a_mano", {
      destinos: ["instagram", "linkedin"],
      actualizadaEn: "2026-10-07T14:00:00Z",
      permalink: "https://www.instagram.com/reel/abc/",
    })

    const { avisos } = construirInicio({ piezas: [ambos], ahora: AHORA, zona: ZONA })

    expect(avisos[0]?.texto).toBe(
      "Quedó anotado como subido por ti, con la etiqueta de IA en Instagram y el texto en LinkedIn.",
    )
    expect(avisos[0]?.accion?.href).toBe("https://www.instagram.com/reel/abc/")
  })
})

describe("Inicio con la voz en la puerta 1", () => {
  const base = {
    titulo: "El deseo",
    explicacion: null,
    guion: "Hola.",
    pilar: null,
    publicarEn: null,
    permalink: null,
    destinos: ["instagram"] as const,
    pendientes: [],
    actualizadaEn: "2026-10-04T12:00:00.000Z",
  }
  const entrada = (piezas: PiezaDeInicio[]) => ({ piezas, ahora: Date.parse(base.actualizadaEn), zona: ZONA })

  it("keeps a voice being made out of what can be signed, under 'En preparación'", () => {
    const inicio = construirInicio(entrada([{ ...base, id: "b", estado: "grabando_voz" }]))
    expect(inicio.firma).toEqual([])
    expect(inicio.enPreparacion).toEqual([{ id: "b", titulo: "El deseo", pilar: null, meta: "Preparando la voz" }])
    expect(inicio.camino).toEqual([])
  })

  it("turns a voice that could not be made into a failure to review, reached from its notice only", () => {
    const texto = "No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz."
    const inicio = construirInicio(entrada([{ ...base, id: "c", estado: "guion_por_aprobar", explicacion: texto }]))
    expect(inicio.atencion).toEqual([
      {
        tipo: "error",
        titulo: "El deseo",
        texto,
        causa: "Tu guion necesita atención.",
        pilar: null,
        accion: { etiqueta: "Revisar", href: "/guion/c" },
      },
    ])
    expect(inicio.firma).toEqual([])
  })

  it("shows a signed piece on its way, with the way to its screen", () => {
    const inicio = construirInicio(entrada([{ ...base, id: "d", estado: "en_render" }]))
    expect(inicio.camino[0]).toMatchObject({
      id: "d",
      estado: "Grabando · unos 5 min · te aviso",
      ocupada: true,
      href: "/guion/d",
    })
    expect(inicio.firma).toEqual([])
  })
})

describe("TEXTO_ENTRA_A_LA_PIEZA", () => {
  it("names no button, so it holds under every failure's own button", () => {
    const tecnico = "HeyGen respondió HTTP 500."
    const estados = [
      "error_publicacion",
      "error_produccion",
      "guion_por_aprobar",
      "guion_en_proceso",
      "video_por_aprobar",
    ] as const
    const inicio = construirInicio({
      piezas: estados.map((estado) => pieza(estado, { explicacion: tecnico })),
      ahora: AHORA,
      zona: ZONA,
    })
    const etiquetas = new Set(inicio.atencion.flatMap((aviso) => (aviso.accion ? [aviso.accion.etiqueta] : [])))
    expect(etiquetas).toEqual(new Set(["Revisar", "Elegir otra fecha"]))
    for (const etiqueta of etiquetas) expect(TEXTO_ENTRA_A_LA_PIEZA).not.toContain(etiqueta)
  })
})
