import { describe, expect, it } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { alinearConGuion, assDe, leerSrt, marcaAss } from "@/lib/dominio/subtitulos"

const SRT_HEYGEN =
  "\uFEFF1\r\n00:00:00,100 --> 00:00:01,020\r\n¿Te cuesta sentirte la\r\n\r\n" +
  "2\r\n00:00:03,500 --> 00:00:05,120\r\nEs supercomún dudar de\r\n\r\n" +
  "3\r\n00:00:44,720 --> 00:00:45,920\r\nSoy Connie del\r\nRosario.\r\n"
const GUION = "¿Te cuesta sentirte la\n\nEs súper común dudar de\n\nSoy Coni del Rosario."

describe("subtítulos", () => {
  it("lee tiempos y texto cuando el srt trae bom y crlf", () => {
    expect(leerSrt(SRT_HEYGEN)).toEqual([
      [0.1, 1.02, "¿Te cuesta sentirte la"],
      [3.5, 5.12, "Es supercomún dudar de"],
      [44.72, 45.92, "Soy Connie del Rosario."],
    ])
  })

  it("usa las palabras del guion cuando la transcripción difiere", () => {
    const cues = alinearConGuion(leerSrt(SRT_HEYGEN), GUION)
    expect(cues.map(([, , texto]) => texto)).toEqual([
      "¿Te cuesta sentirte la",
      "Es súper común dudar de",
      "Soy Coni del Rosario.",
    ])
    expect(cues.map(([inicio, fin]) => [inicio, fin])).toEqual([
      [0.1, 1.02],
      [3.5, 5.12],
      [44.72, 45.92],
    ])
  })

  it("mantiene el orden cuando el guion tiene una palabra que no se transcribió", () => {
    const srt = [
      [0, 1, "hola a"],
      [1, 2, "todas"],
    ] as const
    expect(alinearConGuion(srt, "Hola, hola a todas.")).toEqual([
      [0, 1, "Hola, hola a"],
      [1, 2, "todas."],
    ])
  })

  it("falla cuando el srt no corresponde al guion", () => {
    const srt = [[0, 2, "un texto que no tiene nada que ver"]] as const
    expect(() => alinearConGuion(srt, GUION)).toThrow(Falla)
    expect(() => alinearConGuion(srt, GUION)).toThrow("no calzan con el guion")
  })

  it("arma el ass centrado en la zona segura con la fuente de coni", () => {
    const ass = assDe([
      [0.1, 1.02, "¿Te cuesta"],
      [61.5, 62.25, "Soy Coni."],
    ])
    expect(ass).toContain("PlayResX: 1080\nPlayResY: 1920")
    expect(ass).toContain("Style: Coni,Montserrat,84,")
    expect(ass).toContain("Dialogue: 0,0:00:00.10,0:00:01.02,Coni,,0,0,0,,{\\an5\\pos(540,1344)}¿Te cuesta")
    expect(ass).toContain("Dialogue: 0,0:01:01.50,0:01:02.25,Coni,,0,0,0,,{\\an5\\pos(540,1344)}Soy Coni.")
  })

  it("redondea los centésimos al par cuando el tiempo cae justo en la mitad, igual que Python", () => {
    expect(marcaAss(1.125)).toBe("0:00:01.12")
    expect(marcaAss(1.375)).toBe("0:00:01.38")
  })

  it("falla cuando el srt trae una marca de tiempo ilegible", () => {
    const srts = [
      "1\n00:xx --> 00:00:02,000\nhola\n",
      "1\n00:01 --> 00:02\nhola\n",
      "1\n00:00:01,000 --> 00:00:02,000 --> 00:00:03,000\nhola\n",
    ]
    for (const srt of srts) {
      expect(() => leerSrt(srt)).toThrow(Falla)
      expect(() => leerSrt(srt)).toThrow("ilegible")
    }
  })

  it("escapa llaves y barras cuando el guion las trae", () => {
    const ass = assDe([[0, 1, "Dile {a tu pareja} \\N que sí"]])
    expect(ass).toContain("Dile \\{a tu pareja\\} \\\u200BN que sí")
  })

  it("falla cuando el guion no tiene palabras", () => {
    const srt = [[0, 1, "hola"]] as const
    expect(() => alinearConGuion(srt, " \n ")).toThrow(Falla)
    expect(() => alinearConGuion(srt, " \n ")).toThrow("El guion está vacío.")
  })

  it("falla cuando el srt no tiene palabras", () => {
    const sinFrases = [[0, 1, "  "]] as const
    for (const srt of [[], sinFrases]) {
      expect(() => alinearConGuion(srt, "hola mundo")).toThrow(Falla)
      expect(() => alinearConGuion(srt, "hola mundo")).toThrow(
        "HeyGen entregó subtítulos sin texto. Vuelve a bajarlos.",
      )
    }
  })

  it("avisa que el guion está vacío cuando el guion y el srt están vacíos", () => {
    expect(() => alinearConGuion([], "")).toThrow("El guion está vacío.")
  })
})
