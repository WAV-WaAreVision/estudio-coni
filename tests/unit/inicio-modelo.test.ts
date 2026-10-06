import { describe, expect, it } from "vitest"
import { construirInicio, type PiezaDeInicio } from "@/lib/inicio/modelo"

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
  it("lists what needs her signature with a link to the screen that signs it", () => {
    const guion = pieza("guion_por_aprobar")
    const video = pieza("video_por_aprobar")

    const inicio = construirInicio({ piezas: [guion, video], ahora: AHORA, zona: ZONA })

    expect(inicio.firma).toEqual([
      { id: guion.id, titulo: guion.titulo, pilar: "deseo", meta: "Guion · 46 s", href: `/guion/${guion.id}` },
      { id: video.id, titulo: video.titulo, pilar: "deseo", meta: "Video · 46 s", href: `/video/${video.id}` },
    ])
  })

  it("says how many things wait and about how long they take", () => {
    const una = construirInicio({ piezas: [pieza("guion_por_aprobar")], ahora: AHORA, zona: ZONA })
    const dos = construirInicio({
      piezas: [pieza("guion_por_aprobar"), pieza("video_por_aprobar")],
      ahora: AHORA,
      zona: ZONA,
    })
    const ninguna = construirInicio({ piezas: [], ahora: AHORA, zona: ZONA })

    expect(una.resumen).toBe("Una cosa espera tu firma · unos 3 min")
    expect(dos.resumen).toBe("2 cosas esperan tu firma · unos 6 min")
    expect(ninguna.resumen).toBe("Esta semana está al día")
    expect({ titulo: una.titulo, tiempo: una.tiempo }).toEqual({
      titulo: "Una cosa espera tu firma",
      tiempo: "unos 3 min",
    })
    expect({ titulo: dos.titulo, tiempo: dos.tiempo }).toEqual({
      titulo: "2 cosas esperan tu firma",
      tiempo: "unos 6 min",
    })
    expect({ titulo: ninguna.titulo, tiempo: ninguna.tiempo }).toEqual({
      titulo: "Esta semana está al día",
      tiempo: null,
    })
  })

  it("shows what is on its way: the script being written, the video being recorded and what is scheduled", () => {
    const escribiendo = pieza("guion_en_proceso")
    const grabando = pieza("en_render")
    const programada = pieza("programado", { publicarEn: "2026-10-10T22:00:00Z" })

    const { camino } = construirInicio({ piezas: [escribiendo, grabando, programada], ahora: AHORA, zona: ZONA })

    expect(camino.map((fila) => [fila.id, fila.estado, fila.ocupada])).toEqual([
      [escribiendo.id, "Escribiendo el guion · te aviso", true],
      [grabando.id, "Grabando · unos 5 min · te aviso", true],
      [programada.id, "Programado · sábado 10 · 19:00", false],
    ])
  })

  it("puts what is scheduled in date order", () => {
    const tarde = pieza("programado", { publicarEn: "2026-10-13T22:00:00Z" })
    const temprano = pieza("programado", { publicarEn: "2026-10-10T22:00:00Z" })

    const { camino } = construirInicio({ piezas: [tarde, temprano], ahora: AHORA, zona: ZONA })

    expect(camino.map((fila) => fila.id)).toEqual([temprano.id, tarde.id])
  })

  it("raises the reason of a failed piece as a notice with the way back to it", () => {
    const fallida = pieza("error_produccion", { explicacion: "HeyGen no pudo terminar el video." })

    const { avisos } = construirInicio({ piezas: [fallida], ahora: AHORA, zona: ZONA })

    expect(avisos).toEqual([
      {
        tipo: "error",
        titulo: fallida.titulo,
        texto: "HeyGen no pudo terminar el video.",
        accion: { etiqueta: "Revisar", href: `/guion/${fallida.id}` },
      },
    ])
  })

  it("raises the reason left on a script that was waiting to be written", () => {
    const sinGuion = pieza("guion_en_proceso", { explicacion: "Llegaste al tope de gasto de este mes." })

    const { avisos, camino } = construirInicio({ piezas: [sinGuion], ahora: AHORA, zona: ZONA })

    expect(avisos[0]).toMatchObject({ tipo: "error", texto: "Llegaste al tope de gasto de este mes." })
    expect(camino).toEqual([])
  })

  it("raises the reason of a script HeyGen sent back, and keeps it in the signature list", () => {
    const devuelta = pieza("guion_por_aprobar", { explicacion: "HeyGen marcó una frase como sensible." })

    const inicio = construirInicio({ piezas: [devuelta], ahora: AHORA, zona: ZONA })

    expect(inicio.avisos[0]).toMatchObject({
      tipo: "error",
      texto: "HeyGen marcó una frase como sensible.",
      accion: { etiqueta: "Revisar la frase", href: `/guion/${devuelta.id}` },
    })
    expect(inicio.firma).toHaveLength(1)
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
    expect(inicio.resumen).toBe("Esta semana está al día")
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

describe("Inicio con la voz aparte", () => {
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

  it("lists an approved script as on its way, linked to its screen", () => {
    const inicio = construirInicio(entrada([{ ...base, id: "a", estado: "guion_aprobado" }]))

    expect(inicio.camino).toEqual([
      {
        id: "a",
        titulo: "El deseo",
        pilar: null,
        estado: "Guion aprobado · falta grabar",
        ocupada: false,
        href: "/guion/a",
      },
    ])
    expect(inicio.firma).toEqual([])
  })

  it("shows a voice being recorded as busy", () => {
    const inicio = construirInicio(entrada([{ ...base, id: "b", estado: "grabando_voz" }]))

    expect(inicio.camino[0]).toMatchObject({ estado: "Grabando la voz · unos segundos", ocupada: true })
  })

  it("turns a failed voice into a notice to review", () => {
    const inicio = construirInicio(
      entrada([{ ...base, id: "c", estado: "guion_aprobado", explicacion: "No pude grabar la voz." }]),
    )

    expect(inicio.camino).toEqual([])
    expect(inicio.avisos).toEqual([
      {
        tipo: "error",
        titulo: "El deseo",
        texto: "No pude grabar la voz.",
        accion: { etiqueta: "Revisar", href: "/guion/c" },
      },
    ])
  })
})
