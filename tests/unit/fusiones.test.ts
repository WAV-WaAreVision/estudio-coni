import { describe, expect, it } from "vitest"
import { elegirVariadas, esDelicada, VEREDICTOS_DE_FUSION } from "@/lib/dominio/fusiones"

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
