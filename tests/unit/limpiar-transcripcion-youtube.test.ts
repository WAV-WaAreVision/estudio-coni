// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { limpiarTranscripcionDeYoutube } from "@/lib/ingesta/limpiar-transcripcion-youtube"

describe("limpiarTranscripcionDeYoutube", () => {
  it.each([
    ["0:000 segundosSo, good", "So, good"],
    ["1:081 minuto y 8 segundosrapidly", "rapidly"],
    ["2:052 minutos y 5 segundosUm,", "Um,"],
    ["8:008 minutosLet us", "Let us"],
    ["1:001 minutoresearch", "research"],
    ["10:0810 minutos y 10 segundosbut", "but"],
    ["10:0810 minutos y 8 segundosbut", "but"],
    ["1:02:031 hora, 2 minutos y 3 segundosand then", "and then"],
    ["1:15:001 hora y 15 minutosfinal", "final"],
    ["0:000 secondsHello there", "Hello there"],
    ["1:081 minute, 8 secondsHello there", "Hello there"],
  ])("strips the glued timestamp of %j", (entrada, esperado) => {
    expect(limpiarTranscripcionDeYoutube(entrada)).toBe(esperado)
  })

  it("drops lines that are only a clock time", () => {
    expect(limpiarTranscripcionDeYoutube("hola\n12:34\n1:02:03\nchao")).toBe("hola chao")
  })

  it("keeps numbers and times that belong to the speech", () => {
    const limpio = limpiarTranscripcionDeYoutube(
      "0:000 segundosat 8:00 in the morning\n0:051 minutoy 1,400 AI enabled devices",
    )
    expect(limpio).toBe("at 8:00 in the morning y 1,400 AI enabled devices")
  })

  it("removes an info card that ends in ...más", () => {
    const entrada =
      "0:000 segundosantes\n\nUniversidad Stanford\nLa Universidad Leland Stanford Junior es privada.\n...más\n\n0:051 minutodespués"
    expect(limpiarTranscripcionDeYoutube(entrada)).toBe("antes después")
  })

  it.each(["…más", "...more", "…more"])("recognises the card terminator %s", (cierre) => {
    expect(limpiarTranscripcionDeYoutube(`uno\n\nTitulo\nDescripcion larga.\n${cierre}\n\ndos`)).toBe("uno dos")
  })

  it("keeps ordinary text when no card terminator is present", () => {
    expect(limpiarTranscripcionDeYoutube("uno\n\nTitulo\nDescripcion\n\ndos")).toBe("uno Titulo Descripcion dos")
  })

  it("removes bracketed sound tags", () => {
    expect(
      limpiarTranscripcionDeYoutube("a [applause] b [Música] c [laughter] d [Aplausos] e [snorts] f [music]"),
    ).toBe("a b c d e f")
  })

  it("keeps brackets that hold numbers", () => {
    expect(limpiarTranscripcionDeYoutube("see [1] there")).toBe("see [1] there")
  })

  it("joins caption lines into one flowing text", () => {
    expect(
      limpiarTranscripcionDeYoutube("0:000 segundosHola a\n0:021 segundostodos los\n0:041 segundosque vienen"),
    ).toBe("Hola a todos los que vienen")
  })

  it("returns empty text when only noise remains", () => {
    expect(limpiarTranscripcionDeYoutube("0:000 segundos[music]\n\n")).toBe("")
  })

  describe("with a real-shaped transcript", () => {
    const limpio = limpiarTranscripcionDeYoutube(
      readFileSync(join(process.cwd(), "tests/fixtures/transcripcion-youtube.txt"), "utf8"),
    )

    it("leaves no timestamps, cards, terminators or tags", () => {
      expect(limpio).not.toMatch(/segundos|minutos?\b|\bhora\b/)
      expect(limpio).not.toMatch(/\d+:\d{2}(?!\s+in the morning)/)
      expect(limpio).not.toContain("Universidad")
      expect(limpio).not.toMatch(/…más|\.\.\.más/)
      expect(limpio).not.toMatch(/[[\]]/)
      expect(limpio).not.toContain("\n")
    })

    it("keeps the speech, including 8:00 in the morning and 1,400", () => {
      expect(limpio).toContain("8:00 in the morning")
      expect(limpio).toContain("1,400 AI enabled devices")
      expect(limpio).toContain("rapidly we forget what we knew last year.")
      expect(limpio).toContain("Final words from the stage.")
    })
  })
})
