import { describe, expect, it } from "vitest"
import { construirCalendario, type PiezaDeCalendario } from "@/lib/calendario/modelo"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

// Thursday 15 Oct 2026, 12:00 in Santiago (summer time, UTC-3, since early September).
const AHORA = Date.parse("2026-10-15T15:00:00.000Z")
const HORARIO = { dias: [2, 4, 6], hora: "19:00", zona: "America/Santiago" }

// 19:00 in Santiago on the given day of October 2026 is 22:00 UTC.
const alas19 = (dia: number) => `2026-10-${String(dia).padStart(2, "0")}T22:00:00.000Z`

let contador = 0
function pieza(extra: Partial<PiezaDeCalendario>): PiezaDeCalendario {
  contador += 1
  return {
    id: `p${contador}`,
    titulo: `Pieza ${contador}`,
    estado: "programado",
    pilar: "pareja",
    publicarEn: null,
    fechaPropuesta: null,
    creadaEn: `2026-10-0${(contador % 9) + 1}T12:00:00.000Z`,
    destinos: ["instagram"],
    pendientes: [],
    ...extra,
  }
}

function calendario(piezas: PiezaDeCalendario[], ahora = AHORA, primeraPublicacion?: string, yaPublico = true) {
  return construirCalendario({
    piezas,
    horario: HORARIO,
    ahora,
    primeraPublicacion,
    yaPublico,
    pilares: PILARES_DE_PRUEBA,
  })
}

describe("Mes", () => {
  it("names the month and lays the days out from Monday, with blanks before the first", () => {
    const { mes } = calendario([])

    expect(mes.nombre).toBe("octubre")
    // 1 Oct 2026 is a Thursday: three blanks (Mon, Tue, Wed).
    expect(mes.celdas.slice(0, 4).map((c) => c.dia)).toEqual([null, null, null, 1])
    expect(mes.celdas.filter((c) => c.dia !== null)).toHaveLength(31)
  })

  it("marks today and puts one dot per publication on its day, with the theme named for those who cannot see the colour", () => {
    const { mes } = calendario([
      pieza({ estado: "publicado", publicarEn: alas19(8), pilar: "autoestima" }),
      pieza({ estado: "programado", publicarEn: alas19(17), pilar: "pareja" }),
    ])

    const hoy = mes.celdas.find((c) => c.dia === 15)
    const publicada = mes.celdas.find((c) => c.dia === 8)
    expect(hoy?.hoy).toBe(true)
    expect(mes.celdas.filter((c) => c.hoy)).toHaveLength(1)
    expect(publicada?.puntos).toEqual(["autoestima"])
    expect(publicada?.descripcion).toBe('jueves 8: Autoestima y "ser tu propia diosa"')
    expect(mes.celdas.find((c) => c.dia === 17)?.puntos).toEqual(["pareja"])
    expect(mes.celdas.find((c) => c.dia === 9)?.puntos).toEqual([])
  })

  it("names a LinkedIn pillar from the catalog it is given", () => {
    const { mes, agenda } = calendario([pieza({ estado: "programado", publicarEn: alas19(17), pilar: "caso-coni" })])

    expect(mes.celdas.find((c) => c.dia === 17)?.descripcion).toBe("sábado 17: Caso Coni: humana + avatar")
    expect(mes.proximos[0]?.pilar?.nombre).toBe("Caso Coni: humana + avatar")
    expect(agenda.semanas[0]?.huecos.find((h) => h.dia === "Sábado 17")?.ocupante?.pilar).toEqual({
      slug: "caso-coni",
      nombre: "Caso Coni: humana + avatar",
      nombreCorto: "Caso Coni",
    })
  })

  it("says nothing is scheduled when the month has no dated publications, even with scripts on their way", () => {
    const { mes } = calendario([pieza({ estado: "guion_en_proceso" })])

    expect(mes.sinPublicaciones).toBe(true)
    expect(calendario([pieza({ estado: "programado", publicarEn: alas19(17) })]).mes.sinPublicaciones).toBe(false)
  })

  it("lists the next three things that are coming, soonest first, with their date", () => {
    const { mes } = calendario([
      pieza({ estado: "publicado", publicarEn: alas19(8), titulo: "Ya salió" }),
      pieza({ estado: "programado", publicarEn: alas19(17), titulo: "Sábado" }),
      pieza({ estado: "programado", publicarEn: alas19(20), titulo: "Martes" }),
      pieza({ estado: "programado", publicarEn: alas19(22), titulo: "Jueves" }),
      pieza({ estado: "programado", publicarEn: alas19(24), titulo: "Sábado dos" }),
    ])

    expect(mes.proximos.map((p) => [p.titulo, p.fecha])).toEqual([
      ["Sábado", "sábado 17 · 19:00"],
      ["Martes", "martes 20 · 19:00"],
      ["Jueves", "jueves 22 · 19:00"],
    ])
  })
})

describe("Agenda", () => {
  it("lists only the next free slot as a row and counts the rest of each week in one line", () => {
    const { agenda } = calendario([])

    const libres = agenda.semanas.flatMap((s) => s.huecos).filter((h) => h.ocupante === null)
    expect(libres.map((h) => h.dia)).toEqual(["Jueves 15"])
    expect(agenda.semanas.map((s) => s.libresMas)).toEqual([
      "y 1 espacio libre más",
      "3 espacios libres",
      "3 espacios libres",
      "3 espacios libres",
    ])
  })

  it("never hides a slot that has a piece, and says «1 espacio libre» in the singular", () => {
    const { agenda } = calendario([
      pieza({ estado: "programado", publicarEn: alas19(15) }),
      pieza({ estado: "programado", publicarEn: alas19(17) }),
      pieza({ estado: "programado", publicarEn: alas19(20) }),
      pieza({ estado: "programado", publicarEn: alas19(22) }),
    ])

    expect(agenda.semanas[0]?.huecos.map((h) => h.ocupante !== null)).toEqual([true, true])
    expect(agenda.semanas[1]?.huecos.map((h) => [h.dia, h.ocupante !== null])).toEqual([
      ["Martes 20", true],
      ["Jueves 22", true],
      ["Sábado 24", false],
    ])
    expect(agenda.semanas[2]?.libresMas).toBe("3 espacios libres")
    expect(agenda.semanas[3]?.libresMas).toBe("3 espacios libres")
  })

  it("shows four weeks from this one, with the slots of the schedule that have not passed", () => {
    const { agenda } = calendario([])

    expect(agenda.semanas.map((s) => s.titulo)).toEqual([
      "Semana del 12 al 18 de octubre",
      "Semana del 19 al 25 de octubre",
      "Semana del 26 de octubre al 1 de noviembre",
      "Semana del 2 al 8 de noviembre",
    ])
    // Tuesday 13 is past; Thursday 15 at 19:00 is still ahead of 12:00.
    // Only the next free slot is a row; Saturday 17 is counted under it.
    expect(agenda.semanas[0]?.huecos.map((h) => h.dia)).toEqual(["Jueves 15"])
    expect(agenda.semanas[0]?.huecos.every((h) => h.hora === "19:00")).toBe(true)
  })

  it("leaves a slot free when nothing is in it, and does not offer one that is less than two hours away", () => {
    const casiAhora = Date.parse("2026-10-15T20:30:00.000Z") // 17:30: Thursday's 19:00 is 1.5 hours away
    const { agenda } = construirCalendario({
      piezas: [],
      horario: HORARIO,
      ahora: casiAhora,
      yaPublico: true,
      pilares: PILARES_DE_PRUEBA,
    })

    expect(agenda.semanas[0]?.huecos.map((h) => h.dia)).toEqual(["Sábado 17"])
    expect(agenda.semanas[0]?.huecos[0]?.ocupante).toBeNull()
  })

  it("puts a scheduled piece in its slot, as scheduled and not provisional", () => {
    const programada = pieza({ estado: "programado", publicarEn: alas19(17), titulo: "Si van a discutir" })
    const { agenda } = calendario([programada])

    const hueco = agenda.semanas[0]?.huecos.find((h) => h.dia === "Sábado 17")
    expect(hueco?.ocupante).toMatchObject({
      titulo: "Si van a discutir",
      estado: "Programado",
      tono: "ok",
      provisional: false,
      href: `/video/${programada.id}`,
    })
  })

  it("keeps an approved time that no longer matches the schedule as its own row", () => {
    const aLas1830 = "2026-10-16T21:30:00.000Z" // Friday 18:30: neither a day nor an hour of the schedule
    const { agenda } = calendario([pieza({ estado: "programado", publicarEn: aLas1830, titulo: "Fuera de horario" })])

    const huecos = agenda.semanas[0]?.huecos ?? []
    expect(huecos.map((h) => [h.dia, h.hora])).toEqual([
      ["Jueves 15", "19:00"],
      ["Viernes 16", "18:30"],
    ])
    expect(huecos[1]?.ocupante?.titulo).toBe("Fuera de horario")
  })

  it("places pieces that have no date yet in the next free slots, the most advanced first, saying what each one needs", () => {
    const escribiendose = pieza({
      estado: "guion_en_proceso",
      titulo: "Escribiéndose",
      creadaEn: "2026-10-12T12:00:00.000Z",
    })
    const videoListo = pieza({
      estado: "video_por_aprobar",
      titulo: "Video listo",
      creadaEn: "2026-10-14T12:00:00.000Z",
    })
    const guionListo = pieza({
      estado: "guion_por_aprobar",
      titulo: "Guion listo",
      creadaEn: "2026-10-13T12:00:00.000Z",
    })
    const { agenda } = calendario([
      escribiendose,
      videoListo,
      guionListo,
      pieza({ estado: "programado", publicarEn: alas19(15), titulo: "Ya programado" }),
    ])

    const huecos = agenda.semanas.flatMap((s) => s.huecos)
    expect(huecos.slice(0, 5).map((h) => [h.dia, h.ocupante?.titulo ?? null])).toEqual([
      ["Jueves 15", "Ya programado"],
      ["Sábado 17", "Video listo"],
      ["Martes 20", "Guion listo"],
      ["Jueves 22", "Escribiéndose"],
      ["Sábado 24", null],
    ])
    expect(huecos[1]?.ocupante).toMatchObject({
      estado: "Falta tu firma: video y fecha",
      tono: "aviso",
      provisional: true,
      href: `/video/${videoListo.id}`,
    })
    expect(huecos[2]?.ocupante).toMatchObject({ estado: "Falta tu firma: guion", href: `/guion/${guionListo.id}` })
    expect(huecos[3]?.ocupante).toMatchObject({ estado: "Guion en preparación", tono: "neutro", href: null })
  })

  it("keeps a scheduled piece whose time just passed on the agenda until it goes out, but not an old one", () => {
    const reciente = pieza({ estado: "programado", publicarEn: "2026-10-15T14:30:00.000Z", titulo: "Por salir" }) // 11:30
    const vieja = pieza({ estado: "programado", publicarEn: "2026-10-15T13:00:00.000Z", titulo: "Muy atrasada" }) // 10:00

    const { agenda } = calendario([reciente, vieja])

    const titulos = agenda.semanas.flatMap((s) => s.huecos.map((h) => h.ocupante?.titulo))
    expect(titulos).toContain("Por salir")
    expect(titulos).not.toContain("Muy atrasada")
  })

  it("lists the pieces that are being recorded as recording", () => {
    const { agenda } = calendario([pieza({ estado: "en_render", titulo: "En grabación" })])

    expect(agenda.semanas[0]?.huecos[0]?.ocupante).toMatchObject({ estado: "Grabando", href: null })
  })

  it("lists a piece with its script approved among the undated ones, after the ones being recorded", () => {
    const { agenda } = calendario([
      pieza({ estado: "guion_aprobado", titulo: "Guion aprobado", creadaEn: "2026-10-01T12:00:00.000Z" }),
      pieza({ estado: "en_render", titulo: "En grabación", creadaEn: "2026-10-02T12:00:00.000Z" }),
    ])

    const titulos = agenda.semanas.flatMap((s) => s.huecos.map((h) => h.ocupante?.titulo ?? null))
    expect(titulos.filter((titulo) => titulo !== null)).toEqual(["En grabación", "Guion aprobado"])
  })

  it("names an approved script and a voice being recorded for what they are, linking only the one she can act on", () => {
    const { agenda } = calendario([
      pieza({ estado: "grabando_voz", titulo: "Voz", creadaEn: "2026-10-01T12:00:00.000Z" }),
      pieza({ estado: "guion_aprobado", titulo: "Aprobado", creadaEn: "2026-10-02T12:00:00.000Z" }),
    ])

    const ocupantes = agenda.semanas.flatMap((s) => s.huecos.flatMap((h) => (h.ocupante ? [h.ocupante] : [])))
    expect(ocupantes).toMatchObject([
      { titulo: "Voz", estado: "Preparando la voz", href: null },
      { titulo: "Aprobado", estado: "Guion aprobado · falta grabar", href: expect.stringMatching(/^\/guion\//) },
    ])
  })

  it("does not show discarded pieces, ideas or pieces already published", () => {
    const { agenda } = calendario([
      pieza({ estado: "descartado" }),
      pieza({ estado: "idea" }),
      pieza({ estado: "publicado", publicarEn: alas19(8) }),
    ])

    expect(agenda.semanas.flatMap((s) => s.huecos).every((h) => h.ocupante === null)).toBe(true)
  })

  it("puts a stored proposal in its slot as «propuesta» and the rest where they would go, as before", () => {
    const video = pieza({ estado: "video_por_aprobar", titulo: "Video listo", fechaPropuesta: alas19(22) })
    const guion = pieza({ estado: "guion_por_aprobar", titulo: "Guion listo" })
    const { agenda } = calendario([video, guion])

    const huecos = agenda.semanas.flatMap((s) => s.huecos)
    expect(huecos.find((h) => h.dia === "Jueves 22")?.ocupante).toMatchObject({
      titulo: "Video listo",
      provisional: true,
      propuesta: true,
    })
    expect(huecos.find((h) => h.dia === "Jueves 15")?.ocupante).toMatchObject({
      titulo: "Guion listo",
      provisional: true,
      propuesta: false,
    })
  })

  it("counts what Repartir would store and offers the next three slots nobody holds", () => {
    const { agenda } = calendario([
      pieza({ estado: "video_por_aprobar", fechaPropuesta: alas19(22) }),
      pieza({ estado: "guion_por_aprobar" }),
      pieza({ estado: "programado", publicarEn: alas19(17) }),
    ])

    expect(agenda.porRepartir).toBe(1)
    expect(agenda.alternativas).toEqual([
      { instante: alas19(20), etiqueta: "Martes 20 · 19:00" },
      { instante: alas19(24), etiqueta: "Sábado 24 · 19:00" },
      { instante: alas19(27), etiqueta: "Martes 27 · 19:00" },
    ])
  })

  it("drops a proposal a signed piece took: the piece goes where it would go without it", () => {
    const { agenda } = calendario([
      pieza({ estado: "guion_por_aprobar", titulo: "Desplazado", fechaPropuesta: alas19(17) }),
      pieza({ estado: "programado", publicarEn: alas19(17), titulo: "Firmado" }),
    ])

    const huecos = agenda.semanas.flatMap((s) => s.huecos)
    expect(huecos.find((h) => h.dia === "Sábado 17")?.ocupante?.titulo).toBe("Firmado")
    expect(huecos.find((h) => h.dia === "Jueves 15")?.ocupante).toMatchObject({
      titulo: "Desplazado",
      propuesta: false,
    })
    expect(agenda.porRepartir).toBe(1)
  })

  it("keeps a stored proposal off the schedule as its own row", () => {
    const fuera = "2026-10-16T21:30:00.000Z" // Friday 18:30
    const { agenda } = calendario([pieza({ estado: "guion_por_aprobar", titulo: "Viernes", fechaPropuesta: fuera })])
    expect(agenda.semanas[0]?.huecos.map((h) => [h.dia, h.ocupante?.titulo ?? null])).toEqual([
      ["Jueves 15", null],
      ["Viernes 16", "Viernes"],
    ])
  })
})

describe("Ritmo", () => {
  it("teaches her schedule before her first publication, instead of counting 0 of 0", () => {
    const { ritmo } = calendario([pieza({ estado: "programado", publicarEn: alas19(17) })], AHORA, undefined, false)

    expect(ritmo.antesDeEmpezar).toBe(
      "Todavía no publicas. Tu ritmo es martes, jueves y sábado a las 19:00. Cuando salga la primera pieza, aquí verás si vas al día.",
    )
    expect(ritmo.sugerencia).toBeNull()
    expect(ritmo.vacio).toBe(false)
  })

  it("names a single day without a list", () => {
    const { ritmo } = construirCalendario({
      piezas: [],
      horario: { ...HORARIO, dias: [4], hora: "18:30:00" },
      ahora: AHORA,
      yaPublico: false,
      pilares: PILARES_DE_PRUEBA,
    })

    expect(ritmo.antesDeEmpezar).toBe(
      "Todavía no publicas. Tu ritmo es jueves a las 18:30. Cuando salga la primera pieza, aquí verás si vas al día.",
    )
  })

  it("counts as before once she has published", () => {
    const { ritmo } = calendario([pieza({ estado: "publicado", publicarEn: alas19(8) })])

    expect(ritmo.antesDeEmpezar).toBeNull()
  })

  it("shows the last four weeks by the days of the schedule, filled or free, and how many were used", () => {
    // Published: Tue 29 Sep and Thu 1 Oct; Thu 8 Oct; Tue 13 Oct. Scheduled: Thu 15, Sat 17.
    const { ritmo } = calendario([
      pieza({ estado: "publicado", publicarEn: "2026-09-29T22:00:00.000Z", pilar: "autoestima" }),
      pieza({ estado: "publicado", publicarEn: "2026-10-01T22:00:00.000Z", pilar: "deseo" }),
      pieza({ estado: "publicado", publicarEn: alas19(8), pilar: "pareja" }),
      pieza({ estado: "publicado", publicarEn: alas19(13), pilar: "limites" }),
      pieza({ estado: "programado", publicarEn: alas19(15), pilar: "bienestar" }),
      pieza({ estado: "programado", publicarEn: alas19(17), pilar: "pareja" }),
    ])

    expect(ritmo.columnas).toEqual(["Mar", "Jue", "Sáb"])
    expect(ritmo.semanas.map((s) => s.etiqueta)).toEqual(["21 sep", "28 sep", "5 oct", "12 oct"])
    expect(ritmo.semanas[1]?.celdas.map((c) => c.tipo)).toEqual(["llena", "llena", "libre"])
    expect(ritmo.semanas[3]?.celdas.map((c) => c.tipo)).toEqual(["llena", "llena", "llena"])
    expect(ritmo.resumen).toBe("Tu horario tiene 3 espacios por semana. En estas 4 semanas van 6 de 9.")
  })

  it("does not count the slots before her first reel as free days, not even in the week she started", () => {
    // Her first reel is Thursday 1 Oct: Tuesday 29 Sep of that week was never expected to have one.
    const { ritmo } = calendario([
      pieza({ estado: "publicado", publicarEn: "2026-10-01T22:00:00.000Z" }),
      pieza({ estado: "publicado", publicarEn: "2026-10-03T22:00:00.000Z" }),
    ])

    expect(ritmo.semanas[1]?.celdas.map((c) => (c.tipo === "libre" ? c.falta : "llena"))).toEqual([
      false,
      "llena",
      "llena",
    ])
    expect(ritmo.semanas[2]?.celdas[0]).toEqual({ tipo: "libre", falta: true })
  })

  it("counts only the slots that were expected: ahead ones are not part of the total", () => {
    const { ritmo } = calendario([pieza({ estado: "publicado", publicarEn: alas19(8) })])

    // Thu 8 (done), Sat 10 and Tue 13 (free, past); Thu 15 and Sat 17 are still ahead and not counted.
    expect(ritmo.resumen).toBe("Tu horario tiene 3 espacios por semana. En estas 4 semanas van 1 de 3.")
  })

  it("takes the real first reel when the page is given it, so older free days count", () => {
    const { ritmo } = calendario(
      [pieza({ estado: "publicado", publicarEn: alas19(8) })],
      AHORA,
      "2026-08-01T22:00:00.000Z",
    )

    expect(ritmo.semanas[0]?.celdas.every((c) => c.tipo === "libre" && c.falta)).toBe(true)
  })

  it("does not suggest changes while there are two weeks or fewer of history", () => {
    const { ritmo } = calendario([
      pieza({ estado: "publicado", publicarEn: alas19(8) }),
      pieza({ estado: "publicado", publicarEn: alas19(10) }),
    ])

    expect(ritmo.sugerencia).toBeNull()
  })

  it("suggests a change when one day of the schedule stays free almost every week, once there are three weeks to judge", () => {
    // Thursdays and Saturdays used every week since 21 Sep; Tuesdays never.
    const jueves = ["2026-09-24", "2026-10-01", "2026-10-08"].map((d) => `${d}T22:00:00.000Z`)
    const sabados = ["2026-09-26", "2026-10-03", "2026-10-10"].map((d) => `${d}T22:00:00.000Z`)
    const { ritmo } = calendario(
      [...jueves, ...sabados].map((publicarEn) => pieza({ estado: "publicado", publicarEn })),
    )

    expect(ritmo.sugerencia).toBe(
      "Los martes casi siempre quedan libres. ¿Cambiamos el horario o publicamos menos días a la semana?",
    )
  })

  it("does not blame a day for slots still ahead, nor for weeks before her first publication", () => {
    const { ritmo } = calendario([pieza({ estado: "publicado", publicarEn: alas19(8) })])

    expect(ritmo.sugerencia).toBeNull()
    expect(ritmo.semanas[3]?.celdas.map((c) => c.tipo)).toEqual(["libre", "libre", "libre"])
  })

  it("says there is nothing to show yet when no reel has gone out or been scheduled", () => {
    const { ritmo } = calendario([])

    expect(ritmo.vacio).toBe(true)
  })
})

describe("destinos", () => {
  const dia = (n: number, extra: Partial<PiezaDeCalendario>) => pieza({ publicarEn: alas19(n), ...extra })
  const ocupante = (piezas: PiezaDeCalendario[], etiqueta: string) =>
    calendario(piezas)
      .agenda.semanas.flatMap((s) => s.huecos)
      .find((h) => h.dia === etiqueta)?.ocupante

  it("names the pending destinations in the label of a piece waiting to be uploaded", () => {
    const solo = dia(13, { estado: "para_subir_a_mano", destinos: ["instagram", "linkedin"], pendientes: ["linkedin"] })
    const ambos = dia(15, {
      estado: "para_subir_a_mano",
      destinos: ["instagram", "linkedin"],
      pendientes: ["instagram", "linkedin"],
    })

    expect(ocupante([solo], "Martes 13")?.estado).toBe("Para subir a LinkedIn")
    expect(ocupante([ambos], "Jueves 15")?.estado).toBe("Para subir a Instagram y LinkedIn")
  })

  it("puts a destination line on every dated piece and none on a proposal", () => {
    const programada = dia(15, { estado: "programado", destinos: ["instagram", "linkedin"] })
    expect(ocupante([programada], "Jueves 15")?.destinos).toBe("Instagram · LinkedIn")
    expect(ocupante([dia(15, { estado: "programado" })], "Jueves 15")?.destinos).toBe("Instagram")

    const propuesta = pieza({ estado: "video_por_aprobar" })
    const huecos = calendario([propuesta]).agenda.semanas.flatMap((s) => s.huecos)
    expect(huecos.find((h) => h.ocupante?.titulo === propuesta.titulo)?.ocupante?.destinos).toBeNull()
  })

  it("tells Mes which networks each piece waits for", () => {
    const { mes } = calendario([
      dia(13, { estado: "para_subir_a_mano", destinos: ["instagram", "linkedin"], pendientes: ["linkedin"] }),
    ])
    expect(mes.porSubir[0]?.pendientes).toBe("LinkedIn")
  })

  it("says in the description of a day which networks, for those who cannot see the dots", () => {
    const { mes } = calendario([dia(15, { estado: "programado", destinos: ["instagram", "linkedin"] })])
    expect(mes.celdas.find((c) => c.dia === 15)?.descripcion).toBe(
      "jueves 15: Pareja y conversación, en Instagram y LinkedIn",
    )
  })
})

describe("subir a mano", () => {
  const paraSubir = (dia: number, titulo: string) =>
    pieza({ estado: "para_subir_a_mano", publicarEn: alas19(dia), titulo })

  it("lists in Mes what waits for her to upload, the oldest first, and no longer says nothing is scheduled", () => {
    const { mes } = calendario([paraSubir(13, "Martes"), paraSubir(8, "Jueves pasado")])

    expect(mes.porSubir.map((p) => [p.titulo, p.fecha])).toEqual([
      ["Jueves pasado", "jueves 8 · 19:00"],
      ["Martes", "martes 13 · 19:00"],
    ])
    expect(mes.sinPublicaciones).toBe(false)
  })

  it("keeps the uploaded ones out of that list and says on the day how each one stands", () => {
    const { mes } = calendario([
      paraSubir(13, "Pendiente"),
      pieza({ estado: "publicado_a_mano", publicarEn: alas19(8), pilar: "deseo" }),
    ])

    expect(mes.porSubir.map((p) => p.titulo)).toEqual(["Pendiente"])
    expect(mes.celdas.find((c) => c.dia === 8)?.descripcion).toBe("jueves 8: Deseo y sexualidad, subido a mano")
    expect(mes.celdas.find((c) => c.dia === 13)?.descripcion).toBe("martes 13: Pareja y conversación, para subir")
    expect(mes.celdas.find((c) => c.dia === 8)?.puntos).toEqual(["deseo"])
  })

  it("puts a piece for upload in the slot of this week it was approved for, even if the time passed hours ago", () => {
    const espera = paraSubir(13, "Martes")
    const { agenda } = calendario([espera])

    const hueco = agenda.semanas[0]?.huecos.find((h) => h.dia === "Martes 13")
    expect(hueco?.ocupante).toMatchObject({
      estado: "Para subir a Instagram",
      tono: "aviso",
      provisional: false,
      href: `/video/${espera.id}`,
    })
  })

  it("shows what she uploaded this week as 'Subido a mano' and leaves older weeks to Mes", () => {
    const hecha = pieza({ estado: "publicado_a_mano", publicarEn: alas19(13), titulo: "Subida" })
    const vieja = pieza({ estado: "publicado_a_mano", publicarEn: alas19(6), titulo: "Vieja" })
    const { agenda } = calendario([hecha, vieja])

    const huecos = agenda.semanas.flatMap((s) => s.huecos)
    expect(huecos.find((h) => h.dia === "Martes 13")?.ocupante).toMatchObject({ estado: "Subido a mano", tono: "ok" })
    expect(huecos.map((h) => h.ocupante?.titulo)).not.toContain("Vieja")
  })

  it("counts a reel uploaded by hand as a slot used in Ritmo", () => {
    const { ritmo } = calendario(
      [pieza({ estado: "publicado_a_mano", publicarEn: alas19(13) })],
      AHORA,
      "2026-09-29T22:00:00.000Z",
    )

    expect(ritmo.vacio).toBe(false)
    expect(ritmo.semanas.at(-1)?.celdas[0]).toMatchObject({ tipo: "llena" })
  })
})
