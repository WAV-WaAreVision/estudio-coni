import { describe, expect, it } from "vitest"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import {
  AVISO_TRAS_MOSTRAR,
  AVISO_TRAS_OCULTAR,
  AVISO_TRAS_OCULTAR_LA_ULTIMA,
  destinoTrasOcultar,
  hrefDeTema,
  hrefTrasMostrar,
  hrefTrasOcultar,
  leerIdeaMostrada,
  leerIdeaOculta,
} from "@/lib/dominio/biblioteca/filtros-de-temas"

const TEMA = "33333333-2222-4333-8444-555555555555"
const IDEA = "44444444-2222-4333-8444-555555555555"

describe("the addresses of Temas", () => {
  it("leads to a topic's page", () => {
    expect(hrefDeTema(TEMA)).toBe(`/biblioteca/temas/${TEMA}`)
  })

  it("after hiding goes to the topic while it keeps ideas, and to the list after its last one (D6)", () => {
    expect(hrefTrasOcultar(TEMA, IDEA, 2)).toBe(`/biblioteca/temas/${TEMA}?oculta=${IDEA}`)
    expect(hrefTrasOcultar(TEMA, IDEA, 1)).toBe(`/biblioteca/temas?oculta=${IDEA}`)
    expect(leerIdeaOculta({ oculta: IDEA })).toBe(IDEA)
    expect(leerIdeaOculta({ oculta: "1" })).toBeNull()
    expect(AVISO_TRAS_OCULTAR).toBe("La oculté. La puedes volver a mostrar desde su autor.")
    expect(AVISO_TRAS_OCULTAR_LA_ULTIMA).toBe(
      "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor.",
    )
  })
})

describe("destinoTrasOcultar", () => {
  it("keeps an address of the Biblioteca, with its note", () => {
    expect(destinoTrasOcultar(`/biblioteca/temas/${TEMA}?oculta=${IDEA}`)).toBe(
      `/biblioteca/temas/${TEMA}?oculta=${IDEA}`,
    )
    expect(destinoTrasOcultar(`/biblioteca/temas?oculta=${IDEA}`)).toBe(`/biblioteca/temas?oculta=${IDEA}`)
    expect(destinoTrasOcultar(`/biblioteca/autores/${TEMA}?mostrada=${IDEA}`)).toBe(
      `/biblioteca/autores/${TEMA}?mostrada=${IDEA}`,
    )
  })

  it.each([
    ["an external address", "https://evil.example/biblioteca/temas"],
    ["a protocol-relative address", "//evil.example/biblioteca/temas"],
    ["a doubled slash inside", "/biblioteca//evil.example"],
    ["a backslash", "/biblioteca/\\evil.example"],
    ["a scheme", "javascript:alert(1)"],
    ["a climb out", "/biblioteca/../ingreso"],
    ["an encoded climb out", "/biblioteca/%2e%2e/ingreso"],
    ["another section", "/agenda"],
    ["the section's prefix without its slash", "/bibliotecas/temas"],
    ["a relative path", "biblioteca/temas"],
    ["an empty address", ""],
    ["something that is not text", 42],
  ])("falls back to the Temas list for %s, so it never becomes an open redirect", (_, destino) => {
    expect(destinoTrasOcultar(destino)).toBe("/biblioteca/temas")
  })
})

describe("after Mostrar", () => {
  it("goes back to the author with the idea in the address, and says where it went (deviation 2)", () => {
    expect(hrefTrasMostrar(TEMA, IDEA)).toBe(`/biblioteca/autores/${TEMA}?mostrada=${IDEA}`)
    expect(leerIdeaMostrada({ mostrada: IDEA })).toBe(IDEA)
    expect(leerIdeaMostrada({ mostrada: "1" })).toBeNull()
    expect(leerIdeaMostrada({})).toBeNull()
    expect(AVISO_TRAS_MOSTRAR).toBe("La volví a mostrar. Está en «Sin tema todavía».")
  })
})

describe("leerSeleccion", () => {
  it("reads the side panel of each section by its own key", () => {
    expect(leerSeleccion({ m: TEMA })).toBe(TEMA)
    expect(leerSeleccion({ a: TEMA }, "a")).toBe(TEMA)
    expect(leerSeleccion({ t: "no-es-un-id" }, "t")).toBeNull()
  })
})
