import { describe, expect, test } from "vitest"
import { canonicos, destinosValidos, nombreDeDestinos, resumenDePublicaciones } from "@/lib/dominio/destinos"

describe("destinos", () => {
  test("handles order when linkedin comes first: instagram always leads", () => {
    expect(canonicos(["linkedin", "instagram"])).toEqual(["instagram", "linkedin"])
  })

  test("refuses an empty, unknown or repeated list", () => {
    expect(destinosValidos([])).toBe(false)
    expect(destinosValidos(["tiktok"])).toBe(false)
    expect(destinosValidos(["instagram", "instagram"])).toBe(false)
  })

  test("accepts each of the three lists, in any order", () => {
    expect(destinosValidos(["linkedin"])).toBe(true)
    expect(destinosValidos(["instagram"])).toBe(true)
    expect(destinosValidos(["linkedin", "instagram"])).toBe(true)
  })

  test("handles names for Coni when there are one or two destinations", () => {
    expect(nombreDeDestinos(["instagram"])).toBe("Instagram")
    expect(nombreDeDestinos(["linkedin"])).toBe("LinkedIn")
    expect(nombreDeDestinos(["linkedin", "instagram"])).toBe("Instagram y LinkedIn")
  })

  test("handles the summary when one destination is still pending", () => {
    const resumen = resumenDePublicaciones([
      { destino: "instagram", estado: "subido_a_mano" },
      { destino: "linkedin", estado: "para_subir" },
    ])
    expect(resumen).toEqual({ pendientes: ["linkedin"], todosListos: false, algunoAMano: true })
  })

  test("handles the summary when every destination was published by itself: none by hand", () => {
    const resumen = resumenDePublicaciones([{ destino: "instagram", estado: "publicado" }])
    expect(resumen).toEqual({ pendientes: [], todosListos: true, algunoAMano: false })
  })

  test("handles the summary when a destination still waits for its time: it is pending", () => {
    const resumen = resumenDePublicaciones([
      { destino: "linkedin", estado: "esperando" },
      { destino: "instagram", estado: "esperando" },
    ])
    expect(resumen.pendientes).toEqual(["instagram", "linkedin"])
  })
})
