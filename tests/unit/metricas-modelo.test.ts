import { describe, expect, it } from "vitest"
import { pilarVisible } from "@/lib/dominio/pilares"
import { construirMetricas, type EntradaDeMetricas } from "@/lib/metricas/modelo"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const AHORA = Date.parse("2026-10-15T15:00:00.000Z") // Thursday 15 Oct 2026, 12:00 in Santiago

function entrada(extra: Partial<EntradaDeMetricas> = {}): EntradaDeMetricas {
  return {
    publicaciones: [],
    lecturasLinkedin: [],
    lecturas: [],
    consultas: [],
    clics: [],
    zona: "America/Santiago",
    ahora: AHORA,
    pilares: PILARES_DE_PRUEBA,
    ...extra,
  }
}

function publicada(id: string, pilar: string | null, publicadoEn: string, titulo = `Reel ${id}`) {
  return { piezaId: id, titulo, pilar, red: "instagram" as const, aMano: false, publicadoEn }
}

function enLinkedin(id: string, publicadoEn: string, titulo = `Post ${id}`, pilar: string | null = null) {
  return { piezaId: id, titulo, pilar, red: "linkedin" as const, aMano: false, publicadoEn }
}

function lecturaLinkedin(piezaId: string, extra: Partial<EntradaDeMetricas["lecturasLinkedin"][number]> = {}) {
  return {
    piezaId,
    medidoEn: "2026-10-12",
    impresiones: 1200,
    reacciones: 14,
    comentarios: 3,
    compartidos: 1,
    ...extra,
  }
}

function lectura(piezaId: string, extra: Partial<EntradaDeMetricas["lecturas"][number]> = {}) {
  return {
    piezaId,
    dia: "2026-10-15",
    alcance: 1000,
    guardados: 10,
    compartidos: 2,
    comentarios: 1,
    tiempoPromedio: 24_400,
    ...extra,
  }
}

describe("construirMetricas", () => {
  it("counts this month per network, singular included, and says the period of the contact numbers", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("a", "ia-salud-mental", "2026-10-08T22:00:00.000Z"),
          enLinkedin("a", "2026-10-08T22:00:00.000Z"),
          publicada("b", "practica-clinica", "2026-09-26T22:00:00.000Z"),
          { ...publicada("c", null, "2026-10-13T22:00:00.000Z"), aMano: true },
        ],
        consultas: ["2026-10-07T15:00:00.000Z", "2026-10-12T15:00:00.000Z", "2026-09-30T15:00:00.000Z"],
        clics: [
          { dia: "2026-10-06", clics: 8 },
          { dia: "2026-10-13", clics: 7 },
          { dia: "2026-09-29", clics: 40 },
        ],
      }),
    )

    expect(modelo.mes).toBe("octubre")
    expect(modelo.resumen).toBe("Este mes: 2 reels en Instagram · 1 post en LinkedIn")
    expect(modelo.contacto).toBe("Este mes también: 2 consultas · 15 toques en tu link")
    expect(modelo.periodo).toBe("Últimas 12 semanas")
  })

  it("says plainly that nothing is published yet, and still counts consultations", () => {
    const modelo = construirMetricas(entrada({ consultas: ["2026-10-07T15:00:00.000Z"] }))

    expect(modelo.vacio).toBe(true)
    expect(modelo.resumen).toBe("Este mes: 0 reels en Instagram · 0 posts en LinkedIn")
    expect(modelo.contacto).toBe("Este mes también: 1 consulta · 0 toques en tu link")
    expect(modelo.comparacion).toBeNull()
  })

  it("splits what worked by network, each with its measure, and never mixes them in one bar", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("a", "ia-salud-mental", "2026-10-06T22:00:00.000Z"),
          enLinkedin("a", "2026-10-06T22:00:00.000Z", "Reel a"),
          enLinkedin("b", "2026-10-08T22:00:00.000Z"),
        ],
        lecturas: [lectura("a", { guardados: 121, alcance: 2400 })],
        lecturasLinkedin: [lecturaLinkedin("a", { impresiones: 600 }), lecturaLinkedin("b")],
      }),
    )

    expect(modelo.grupos.map((g) => [g.red, g.titulo, g.cifra, g.medida])).toEqual([
      ["instagram", "Instagram", "1 reel", "Guardados cada 1.000 personas que lo vieron."],
      ["linkedin", "LinkedIn", "2 posts", "Impresiones: las veces que LinkedIn lo mostró."],
    ])
    const [instagram, linkedin] = modelo.grupos
    expect(instagram?.barras.map((b) => [b.piezaId, b.cifra])).toEqual([["a", "50,4"]])
    expect(linkedin?.barras.map((b) => [b.piezaId, b.cifra, b.unidad, b.ancho, b.muestra])).toEqual([
      ["b", "1.200", "impresiones", 100, "14 reacciones · 3 comentarios · 1 vez compartido"],
      ["a", "600", "impresiones", 50, "14 reacciones · 3 comentarios · 1 vez compartido"],
    ])
    expect(linkedin?.barras.every((b) => b.reelsDelTema === 0)).toBe(true)
  })

  it("lists a manual upload and a post without numbers as «sin números», without a bar", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          { ...publicada("a", null, "2026-10-06T22:00:00.000Z"), aMano: true },
          enLinkedin("b", "2026-10-08T22:00:00.000Z"),
        ],
      }),
    )

    const barras = modelo.grupos.flatMap((g) => g.barras)
    expect(barras.map((b) => [b.piezaId, b.texto, b.cifra, b.ancho, b.muestra])).toEqual([
      ["a", "sin números", null, 0, null],
      ["b", "sin números", null, 0, null],
    ])
  })

  it("leaves out a network with nothing in the last twelve weeks, and says so when neither has anything", () => {
    const modelo = construirMetricas(
      entrada({ publicaciones: [publicada("a", null, "2026-06-02T22:00:00.000Z")], lecturas: [lectura("a")] }),
    )

    expect(modelo.vacio).toBe(false)
    expect(modelo.grupos).toEqual([])
  })

  it("orders the bars by saves per 1,000 and scales them to the best one, with the numbers and the theme's n beside", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("a", "pareja", "2026-10-06T22:00:00.000Z"),
          publicada("b", "pareja", "2026-10-08T22:00:00.000Z"),
          publicada("c", "autoestima", "2026-10-13T22:00:00.000Z"),
        ],
        lecturas: [
          lectura("a", { guardados: 10, alcance: 2000 }), // 5 per 1,000
          lectura("b", { guardados: 121, alcance: 2400 }), // 50.4
          lectura("c", { guardados: 12, alcance: 1000 }), // 12
        ],
      }),
    )

    expect((modelo.grupos[0]?.barras ?? []).map((b) => b.piezaId)).toEqual(["b", "c", "a"])
    const mejor = (modelo.grupos[0]?.barras ?? [])[0]
    expect(mejor).toMatchObject({
      valor: 50.4,
      ancho: 100,
      texto: "50,4 cada 1.000 · 121 guardados de 2.400 personas",
      cifra: "50,4",
      unidad: "cada 1.000",
      muestra: "121 guardados de 2.400 personas",
      pilar: pilarVisible(PILARES_DE_PRUEBA, "pareja"),
      reelsDelTema: 2,
    })
    expect((modelo.grupos[0]?.barras ?? [])[1]?.ancho).toBe(24)
    expect((modelo.grupos[0]?.barras ?? [])[2]?.ancho).toBe(10)
  })

  it("lists a reel with no figures yet at the end, without a bar", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("nuevo", "deseo", "2026-10-14T22:00:00.000Z"),
          publicada("a", "pareja", "2026-10-06T22:00:00.000Z"),
        ],
        lecturas: [lectura("a")],
      }),
    )

    expect((modelo.grupos[0]?.barras ?? []).map((b) => b.piezaId)).toEqual(["a", "nuevo"])
    expect((modelo.grupos[0]?.barras ?? [])[1]).toMatchObject({
      valor: null,
      ancho: 0,
      texto: "Todavía sin números: llegan cada mañana a las 7:00.",
      cifra: null,
      muestra: null,
    })
  })

  it("uses the newest reading of each reel", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [publicada("a", "pareja", "2026-10-06T22:00:00.000Z")],
        lecturas: [
          lectura("a", { dia: "2026-10-13", guardados: 1 }),
          lectura("a", { dia: "2026-10-15", guardados: 30 }),
        ],
      }),
    )

    expect((modelo.grupos[0]?.barras ?? [])[0]?.valor).toBe(30)
  })

  it("shows the sample size and refuses to conclude while no two themes have eight reels", () => {
    const publicadas = [0, 1, 2].map((i) => publicada(`a${i}`, "autoestima", `2026-10-0${i + 1}T22:00:00.000Z`))
    publicadas.push(publicada("p0", "pareja", "2026-10-07T22:00:00.000Z"))
    const modelo = construirMetricas(
      entrada({ publicaciones: publicadas, lecturas: publicadas.map((p) => lectura(p.piezaId)) }),
    )

    expect(modelo.comparacion).toMatchObject({
      tipo: "temprano",
      titulo: "Todavía es temprano para concluir",
      texto:
        "Comparo temas cuando haya 8 reels de cada uno. El tema con más reels lleva 3 de 8. Cuento los reels desde que cumplen una semana.",
      avance: 3,
      meta: 8,
      temas: [
        { pilar: pilarVisible(PILARES_DE_PRUEBA, "autoestima"), n: 3 },
        { pilar: pilarVisible(PILARES_DE_PRUEBA, "pareja"), n: 1 },
      ],
    })
  })

  it("says when one theme has reached eight and another has not", () => {
    const publicadas = [
      ...Array.from({ length: 8 }, (_, i) => publicada(`a${i}`, "autoestima", `2026-09-${10 + i}T22:00:00.000Z`)),
      publicada("p0", "pareja", "2026-10-06T22:00:00.000Z"),
      publicada("p1", "pareja", "2026-10-07T22:00:00.000Z"),
    ]
    const modelo = construirMetricas(
      entrada({ publicaciones: publicadas, lecturas: publicadas.map((p) => lectura(p.piezaId)) }),
    )

    expect(modelo.comparacion).toMatchObject({
      tipo: "temprano",
      texto:
        'Autoestima y "ser tu propia diosa" ya tiene 8 reels. Comparo cuando otro tema también llegue a 8; el siguiente lleva 2 de 8. Cuento los reels desde que cumplen una semana.',
      avance: 2,
    })
  })

  it("compares themes once two have eight reels, with n, the interval and a caveat", () => {
    const publicadas = [
      ...Array.from({ length: 8 }, (_, i) => publicada(`a${i}`, "autoestima", `2026-08-${10 + i}T22:00:00.000Z`)),
      ...Array.from({ length: 8 }, (_, i) => publicada(`p${i}`, "pareja", `2026-08-${20 + i}T22:00:00.000Z`)),
    ]
    const guardados = [20, 22, 21, 19, 23, 20, 22, 21]
    const lecturas = [
      ...guardados.map((g, i) => lectura(`a${i}`, { guardados: g })),
      ...guardados.map((g, i) => lectura(`p${i}`, { guardados: g - 10 })),
    ]

    const modelo = construirMetricas(entrada({ publicaciones: publicadas, lecturas }))

    const comparacion = modelo.comparacion
    if (comparacion?.tipo !== "comparable") throw new Error(`Se esperaba comparable y fue ${comparacion?.tipo}`)
    expect(comparacion.temas.map((t) => t.texto)).toEqual([
      'Autoestima y "ser tu propia diosa" · 8 reels · promedio 21 cada 1.000 (entre 19,9 y 22,1)',
      "Pareja y conversación · 8 reels · promedio 11 cada 1.000 (entre 9,9 y 12,1)",
    ])
    expect(comparacion.frase).toContain(
      'Autoestima y "ser tu propia diosa" va por delante de Pareja y conversación por 10 cada 1.000',
    )
    expect(comparacion.frase).toContain("La diferencia es mayor que lo que varían tus reels entre sí.")
    expect(comparacion.cautela).toContain("lo ya publicado")
    expect(comparacion.cautela).toContain("últimos 7 días")
  })

  it("names a LinkedIn pillar from the catalog in what worked", () => {
    const publicadas = [
      ...Array.from({ length: 8 }, (_, i) => publicada(`c${i}`, "caso-coni", `2026-09-${10 + i}T22:00:00.000Z`)),
      publicada("i0", "ia-salud-mental", "2026-10-06T22:00:00.000Z"),
    ]
    const modelo = construirMetricas(
      entrada({ publicaciones: publicadas, lecturas: publicadas.map((p) => lectura(p.piezaId)) }),
    )

    expect(modelo.comparacion).toMatchObject({
      tipo: "temprano",
      texto: expect.stringMatching(/^Caso Coni: humana \+ avatar ya tiene 8 reels\./),
    })
    expect((modelo.grupos[0]?.barras ?? []).find((b) => b.piezaId === "i0")?.pilar?.nombre).toBe("IA y salud mental")
  })

  it("leaves the reels of the last seven days out of the comparison: their saves are still adding up", () => {
    const antiguos = [
      ...Array.from({ length: 8 }, (_, i) => publicada(`a${i}`, "autoestima", `2026-08-${10 + i}T22:00:00.000Z`)),
      ...Array.from({ length: 7 }, (_, i) => publicada(`p${i}`, "pareja", `2026-08-${20 + i}T22:00:00.000Z`)),
    ]
    const reciente = publicada("p7", "pareja", "2026-10-13T22:00:00.000Z")
    const todas = [...antiguos, reciente]

    const modelo = construirMetricas(entrada({ publicaciones: todas, lecturas: todas.map((p) => lectura(p.piezaId)) }))

    expect(modelo.comparacion?.tipo).toBe("temprano")
  })

  it("groups the last weeks, newest first, with their reels' raw numbers", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("a", "pareja", "2026-10-08T22:00:00.000Z", "Si van a discutir"),
          publicada("b", "deseo", "2026-10-13T22:00:00.000Z"),
        ],
        lecturas: [
          lectura("a", { guardados: 121, alcance: 2400, tiempoPromedio: 24_400 }),
          lectura("b", { alcance: null, guardados: null, tiempoPromedio: null }),
        ],
        consultas: ["2026-10-07T15:00:00.000Z"],
        clics: [{ dia: "2026-10-06", clics: 8 }],
      }),
    )

    expect(modelo.semanas.map((s) => s.titulo)).toEqual([
      "Semana del 12 al 18 de octubre",
      "Semana del 5 al 11 de octubre",
    ])
    const semana = modelo.semanas[1]
    expect(semana?.resumen).toBe("1 consulta · 8 toques en tu link")
    expect(semana?.publicaciones).toEqual([
      {
        clave: "instagram:a",
        titulo: "Si van a discutir",
        pilar: pilarVisible(PILARES_DE_PRUEBA, "pareja"),
        meta: "Instagram · 121 guardados · 2.400 de alcance · en promedio se vio 24 s",
      },
    ])
    expect(modelo.semanas[0]?.publicaciones[0]?.meta).toBe("Instagram · Todavía sin números")
  })

  it("lists every publication of a week once per network, with the network and its numbers or «sin números»", () => {
    const modelo = construirMetricas(
      entrada({
        publicaciones: [
          publicada("a", null, "2026-10-13T22:00:00.000Z", "Las dos"),
          enLinkedin("a", "2026-10-13T22:00:00.000Z", "Las dos"),
          { ...publicada("b", null, "2026-10-14T22:00:00.000Z", "A mano"), aMano: true },
          enLinkedin("c", "2026-10-14T23:00:00.000Z", "Sin números"),
        ],
        lecturas: [lectura("a", { guardados: 12, alcance: 2400, tiempoPromedio: null })],
        lecturasLinkedin: [lecturaLinkedin("a", { comentarios: null, compartidos: null })],
      }),
    )

    expect(modelo.semanas[0]?.publicaciones.map((f) => [f.clave, f.titulo, f.meta])).toEqual([
      ["instagram:a", "Las dos", "Instagram · 12 guardados · 2.400 de alcance"],
      ["linkedin:a", "Las dos", "LinkedIn · 1.200 impresiones · 14 reacciones"],
      ["instagram:b", "A mano", "Instagram · sin números"],
      ["linkedin:c", "Sin números", "LinkedIn · sin números"],
    ])
  })

  it("leaves out weeks older than twelve", () => {
    const modelo = construirMetricas(entrada({ consultas: ["2026-01-07T15:00:00.000Z", "2026-10-07T15:00:00.000Z"] }))

    expect(modelo.semanas.map((s) => s.titulo)).toEqual(["Semana del 5 al 11 de octubre"])
  })

  it("warns when reels have been out for days and not one reading has arrived", () => {
    const modelo = construirMetricas(entrada({ publicaciones: [publicada("a", "pareja", "2026-10-06T22:00:00.000Z")] }))

    expect(modelo.aviso).toBe("Todavía no tengo números de tus reels. Si mañana sigue igual, avísale a Federico.")
  })

  it("does not warn about a reel that went out today and has no reading yet", () => {
    const modelo = construirMetricas(entrada({ publicaciones: [publicada("a", "pareja", "2026-10-15T13:00:00.000Z")] }))

    expect(modelo.aviso).toBeNull()
  })

  it("warns, with the day it shows, when the morning reading did not arrive", () => {
    const atrasada = construirMetricas(
      entrada({
        publicaciones: [publicada("a", "pareja", "2026-10-06T22:00:00.000Z")],
        lecturas: [lectura("a", { dia: "2026-10-12" })],
      }),
    )
    const alDia = construirMetricas(
      entrada({ publicaciones: [publicada("a", "pareja", "2026-10-06T22:00:00.000Z")], lecturas: [lectura("a")] }),
    )

    expect(atrasada.aviso).toBe("No pude traer las métricas de hoy; muestro las del lunes 12 de octubre.")
    expect(alDia.aviso).toBeNull()
  })
})
