// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  LARGO_MAXIMO_TRANSPARENCIA,
  LARGO_MINIMO_TRANSPARENCIA,
  LINEA_PARA_LA_BIO,
  largoDeTexto,
  normalizarTexto,
  parrafos,
  TITULO_DE_TRANSPARENCIA,
} from "@/lib/transparencia/texto"

describe("texto de la página de IA", () => {
  it("has the limits of the database and the title of the page", () => {
    expect([LARGO_MINIMO_TRANSPARENCIA, LARGO_MAXIMO_TRANSPARENCIA]).toEqual([300, 6000])
    expect(TITULO_DE_TRANSPARENCIA).toBe("Cómo uso IA en mi contenido")
  })

  it("offers a line for her bios with the public address", () => {
    expect(LINEA_PARA_LA_BIO).toBe("Cómo uso IA en mi contenido: conidolly.vercel.app/l/ia")
  })

  it("normalises like publicar_transparencia: Windows line ends and the edges", () => {
    expect(normalizarTexto("\r\nUno\r\nDos \n")).toBe("Uno\nDos")
  })

  it("counts characters as the database does, an emoji as one", () => {
    expect(largoDeTexto("\r\n  Hola  \r\n")).toBe(4)
    expect(largoDeTexto("🙂")).toBe(1)
  })

  it("splits paragraphs on blank lines and keeps single line breaks inside one", () => {
    expect(parrafos("Uno.\r\n\r\nDos,\nsigue.\n\n\n\nTres.  ")).toEqual(["Uno.", "Dos,\nsigue.", "Tres."])
    expect(parrafos("   ")).toEqual([])
  })
})
