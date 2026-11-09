import { describe, expect, it } from "vitest"
import {
  AVISOS_DE_FUSION,
  conAvisoDeFusion,
  elegirVariadas,
  esDelicada,
  leerAvisoDeFusion,
  lineaDeFusionReciente,
  pilaresCambiadosDe,
  preguntaDeDeshacer,
  RECHAZOS_DE_FUSION,
  RUTA_DE_FUSIONES,
  razonDeClaude,
  razonDeRechazo,
  subtemaDe,
  tambienSeLlamo,
  tituloDePar,
  VEREDICTOS_DE_FUSION,
} from "@/lib/dominio/fusiones"

const de = (red: string, pilarId: string) => ({ red, pilarId })

describe("esDelicada", () => {
  it("is clear when Claude is sure and no network has two different main pillars", () => {
    expect(esDelicada([de("linkedin", "p1")], [de("linkedin", "p1"), de("instagram", "p2")], true)).toEqual({
      delicada: false,
      motivo: null,
    })
  })

  it("is clear when only one of the two has a main pillar in a network", () => {
    expect(esDelicada([de("linkedin", "p1")], [de("instagram", "p2")], true).delicada).toBe(false)
  })

  it("names the networks where the main pillars differ", () => {
    expect(esDelicada([de("linkedin", "p1")], [de("linkedin", "p3")], true)).toEqual({
      delicada: true,
      motivo: "Tienen distinto pilar principal en LinkedIn.",
    })
    expect(
      esDelicada([de("instagram", "p2"), de("linkedin", "p1")], [de("linkedin", "p3"), de("instagram", "p4")], true)
        .motivo,
    ).toBe("Tienen distinto pilar principal en LinkedIn y Instagram.")
  })

  it("is delicate when Claude is not sure, and says both reasons when both hold", () => {
    expect(esDelicada([], [], false)).toEqual({
      delicada: true,
      motivo: "Claude no está seguro de que sean el mismo tema.",
    })
    expect(esDelicada([de("linkedin", "p1")], [de("linkedin", "p3")], false).motivo).toBe(
      "Tienen distinto pilar principal en LinkedIn. Claude no está seguro de que sean el mismo tema.",
    )
  })
})

describe("elegirVariadas", () => {
  const f = (id: string, autorId: string) => ({ id, autorId })

  it("takes one claim per author first, in order of first appearance, then fills round by round", () => {
    const filas = [f("1", "a"), f("2", "a"), f("3", "a"), f("4", "b"), f("5", "c"), f("6", "b")]
    expect(elegirVariadas(filas, 5).map((x) => x.id)).toEqual(["1", "4", "5", "2", "6"])
  })

  it("returns all when there are fewer than asked", () => {
    expect(elegirVariadas([f("1", "a")], 5)).toEqual([f("1", "a")])
  })
})

it("lists the three verdicts", () => {
  expect(VEREDICTOS_DE_FUSION).toEqual(["mismo", "parte_de", "distintos"])
})

const ZONA = "America/Santiago"

describe("the texts of Fusiones", () => {
  it("lives under Temas", () => {
    expect(RUTA_DE_FUSIONES).toBe("/biblioteca/temas/fusiones")
  })

  it("titles a pair and says when a merge was made, in Santiago's calendar", () => {
    expect(tituloDePar("Poco deseo", "Deseo bajo")).toBe("«Poco deseo» y «Deseo bajo»")
    expect(
      lineaDeFusionReciente(
        { ganador: "Deseo bajo", perdedor: "Poco deseo", aplicadaEn: "2026-11-10T02:30:00Z" },
        ZONA,
      ),
    ).toBe("Uní «Poco deseo» con «Deseo bajo» el lunes 9 de noviembre.")
  })

  it("says Claude's reason only when there is one", () => {
    expect(razonDeClaude("Hablan de lo mismo.")).toBe("Razón: Hablan de lo mismo.")
    expect(razonDeClaude(null)).toBeNull()
  })

  it("says who said no to a pair", () => {
    expect(razonDeRechazo({ origen: "coni", razon: null })).toBe("Tú dijiste que son distintos.")
    expect(razonDeRechazo({ origen: "claude", razon: "Miran cosas distintas." })).toBe("Razón: Miran cosas distintas.")
    expect(razonDeRechazo({ origen: "claude", razon: null })).toBe("Claude dijo que son distintos.")
  })

  it("asks before undoing and names the topic page's lines", () => {
    expect(preguntaDeDeshacer("Deseo bajo", "Poco deseo")).toBe(
      "¿Deshacer la fusión de «Poco deseo» con «Deseo bajo»? Los dos temas vuelven a separarse y no te los vuelvo a proponer.",
    )
    expect(tambienSeLlamo(["Poco deseo", "Sin ganas"])).toBe("También se llamó: Poco deseo, Sin ganas.")
    expect(subtemaDe("Deseo")).toBe("Subtema de «Deseo»")
  })

  it("puts a known note in the address and reads it back; anything else is no note", () => {
    const href = conAvisoDeFusion(RUTA_DE_FUSIONES, "fusion-deshecha")
    expect(href).toBe("/biblioteca/temas/fusiones?aviso=fusion-deshecha")
    expect(leerAvisoDeFusion({ aviso: "fusion-deshecha" })).toBe(AVISOS_DE_FUSION["fusion-deshecha"])
    expect(leerAvisoDeFusion({ aviso: "otra" })).toBeNull()
    expect(leerAvisoDeFusion({})).toBeNull()
  })

  it("has her words for every refusal of the database functions, without long dashes", () => {
    expect(Object.keys(RECHAZOS_DE_FUSION).sort()).toEqual(
      [
        "fusion_inexistente",
        "fusion_no_aplicada",
        "fusion_sin_ideas",
        "fusion_superada",
        "fusion_ya_decidida",
        "par_no_rechazado",
        "tema_inexistente",
        "tema_ya_fusionado",
      ].sort(),
    )
    for (const texto of [...Object.values(RECHAZOS_DE_FUSION), ...Object.values(AVISOS_DE_FUSION)]) {
      expect(texto).not.toMatch(/\u2014/)
    }
  })

  it("tells her to adjust the pillars first when she changed them after the merge", () => {
    expect(pilaresCambiadosDe("Deseo bajo")).toBe(
      'Cambiaste los pilares de "Deseo bajo" después de unirlos. Para separarlos, ajusta primero los pilares.',
    )
  })
})
