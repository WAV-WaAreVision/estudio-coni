import { describe, expect, it } from "vitest"
import { construirMetricas, type EntradaDeMetricas } from "@/lib/metricas/modelo"

const AHORA = Date.parse("2026-10-15T15:00:00.000Z") // Thursday 15 Oct 2026, 12:00 in Santiago

function entrada(extra: Partial<EntradaDeMetricas> = {}): EntradaDeMetricas {
  return { publicadas: [], lecturas: [], consultas: [], clics: [], zona: "America/Santiago", ahora: AHORA, ...extra }
}

function publicada(
  id: string,
  pilar: "pareja" | "autoestima" | "deseo" | null,
  publicadoEn: string,
  titulo = `Reel ${id}`,
) {
  return { id, titulo, pilar, publicadoEn }
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
  it("names the month and sums reels, consultations and clicks of that month", () => {
    const modelo = construirMetricas(
      entrada({
        publicadas: [
          publicada("a", "pareja", "2026-10-08T22:00:00.000Z"),
          publicada("b", "deseo", "2026-09-26T22:00:00.000Z"),
        ],
        lecturas: [lectura("a"), lectura("b")],
        consultas: ["2026-10-07T15:00:00.000Z", "2026-10-12T15:00:00.000Z", "2026-09-30T15:00:00.000Z"],
        clics: [
          { dia: "2026-10-06", clics: 8 },
          { dia: "2026-10-13", clics: 7 },
          { dia: "2026-09-29", clics: 40 },
        ],
      }),
    )

    expect(modelo.mes).toBe("octubre")
    expect(modelo.resumen).toBe("1 reel publicado · 2 consultas · 15 clics en tu link")
  })

  it("says plainly that nothing is published yet, and still counts consultations", () => {
    const modelo = construirMetricas(entrada({ consultas: ["2026-10-07T15:00:00.000Z"] }))

    expect(modelo.vacio).toBe(true)
    expect(modelo.barras).toEqual([])
    expect(modelo.resumen).toBe("0 reels publicados · 1 consulta · 0 clics en tu link")
  })

  it("orders the bars by saves per 1,000 and scales them to the best one, with the numbers and the theme's n beside", () => {
    const modelo = construirMetricas(
      entrada({
        publicadas: [
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

    expect(modelo.barras.map((b) => b.piezaId)).toEqual(["b", "c", "a"])
    const mejor = modelo.barras[0]
    expect(mejor).toMatchObject({
      porMil: 50.4,
      ancho: 100,
      texto: "50,4 cada 1.000 · 121 guardados de 2.400 personas",
      pilar: "pareja",
      reelsDelTema: 2,
    })
    expect(modelo.barras[1]?.ancho).toBe(24)
    expect(modelo.barras[2]?.ancho).toBe(10)
  })

  it("lists a reel with no figures yet at the end, without a bar", () => {
    const modelo = construirMetricas(
      entrada({
        publicadas: [
          publicada("nuevo", "deseo", "2026-10-14T22:00:00.000Z"),
          publicada("a", "pareja", "2026-10-06T22:00:00.000Z"),
        ],
        lecturas: [lectura("a")],
      }),
    )

    expect(modelo.barras.map((b) => b.piezaId)).toEqual(["a", "nuevo"])
    expect(modelo.barras[1]).toMatchObject({
      porMil: null,
      ancho: 0,
      texto: "Todavía sin números: llegan cada mañana a las 7:00.",
    })
  })

  it("uses the newest reading of each reel", () => {
    const modelo = construirMetricas(
      entrada({
        publicadas: [publicada("a", "pareja", "2026-10-06T22:00:00.000Z")],
        lecturas: [
          lectura("a", { dia: "2026-10-13", guardados: 1 }),
          lectura("a", { dia: "2026-10-15", guardados: 30 }),
        ],
      }),
    )

    expect(modelo.barras[0]?.porMil).toBe(30)
  })

  it("shows the sample size and refuses to conclude while no two themes have eight reels", () => {
    const publicadas = [0, 1, 2].map((i) => publicada(`a${i}`, "autoestima", `2026-10-0${i + 1}T22:00:00.000Z`))
    publicadas.push(publicada("p0", "pareja", "2026-10-08T22:00:00.000Z"))
    const modelo = construirMetricas(entrada({ publicadas, lecturas: publicadas.map((p) => lectura(p.id)) }))

    expect(modelo.comparacion).toMatchObject({
      tipo: "temprano",
      titulo: "Todavía es temprano para concluir",
      texto: "Comparo temas cuando haya 8 reels de cada uno. El tema con más reels lleva 3 de 8.",
      avance: 3,
      meta: 8,
      temas: [
        { pilar: "autoestima", n: 3 },
        { pilar: "pareja", n: 1 },
      ],
    })
  })

  it("says when one theme has reached eight and another has not", () => {
    const publicadas = [
      ...Array.from({ length: 8 }, (_, i) => publicada(`a${i}`, "autoestima", `2026-09-${10 + i}T22:00:00.000Z`)),
      publicada("p0", "pareja", "2026-10-08T22:00:00.000Z"),
      publicada("p1", "pareja", "2026-10-09T22:00:00.000Z"),
    ]
    const modelo = construirMetricas(entrada({ publicadas, lecturas: publicadas.map((p) => lectura(p.id)) }))

    expect(modelo.comparacion).toMatchObject({
      tipo: "temprano",
      texto: "Autoestima ya tiene 8 reels. Comparo cuando otro tema también llegue a 8; el siguiente lleva 2 de 8.",
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

    const modelo = construirMetricas(entrada({ publicadas, lecturas }))

    const comparacion = modelo.comparacion
    if (comparacion?.tipo !== "comparable") throw new Error(`Se esperaba comparable y fue ${comparacion?.tipo}`)
    expect(comparacion.temas.map((t) => t.texto)).toEqual([
      "Autoestima · 8 reels · promedio 21 cada 1.000 (entre 19,9 y 22,1)",
      "Pareja y conversación · 8 reels · promedio 11 cada 1.000 (entre 9,9 y 12,1)",
    ])
    expect(comparacion.frase).toContain("Autoestima va por delante de Pareja y conversación por 10 cada 1.000")
    expect(comparacion.frase).toContain("se distingue del azar")
    expect(comparacion.cautela).toMatch(/lo ya publicado/)
  })

  it("groups the last weeks, newest first, with their reels' raw numbers", () => {
    const modelo = construirMetricas(
      entrada({
        publicadas: [
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
    expect(semana?.resumen).toBe("1 consulta · 8 clics en tu link")
    expect(semana?.reels).toEqual([
      {
        piezaId: "a",
        titulo: "Si van a discutir",
        pilar: "pareja",
        meta: "121 guardados · 2.400 de alcance · se vio 24 s",
      },
    ])
    expect(modelo.semanas[0]?.reels[0]?.meta).toBe("Todavía sin números")
  })

  it("leaves out weeks older than twelve", () => {
    const modelo = construirMetricas(entrada({ consultas: ["2026-01-07T15:00:00.000Z", "2026-10-07T15:00:00.000Z"] }))

    expect(modelo.semanas.map((s) => s.titulo)).toEqual(["Semana del 5 al 11 de octubre"])
  })

  it("warns, with the day it shows, when the morning reading did not arrive", () => {
    const atrasada = construirMetricas(
      entrada({
        publicadas: [publicada("a", "pareja", "2026-10-06T22:00:00.000Z")],
        lecturas: [lectura("a", { dia: "2026-10-12" })],
      }),
    )
    const alDia = construirMetricas(
      entrada({ publicadas: [publicada("a", "pareja", "2026-10-06T22:00:00.000Z")], lecturas: [lectura("a")] }),
    )

    expect(atrasada.aviso).toBe("No pude traer las métricas de hoy; muestro las del lunes 12 de octubre.")
    expect(alDia.aviso).toBeNull()
  })
})
