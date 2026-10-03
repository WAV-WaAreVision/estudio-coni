// @vitest-environment node
// Reads the golden scripts through import.meta.url, which jsdom does not support.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { leerRevision } from "@/lib/datos/revision"
import {
  AVISO_AVATAR,
  autoresNombrados,
  bloquea,
  CIERRE,
  type Hallazgo,
  LARGO_DE_COPIA,
  LINEAS_AYUDA,
  pideLineasDeAyuda,
  revisarGuion,
  tramosCopiados,
} from "@/lib/dominio/revision"

const SIN_AJENO = { citas: [], autores: [] }
const CITA = "El deseo no se apaga, se esconde debajo de la rutina y del cansancio de todos los días."

// 91 words: inside the 75 to 150 range, ends with the fixed closing, no digits or symbols.
const CUERPO = Array.from({ length: 29 }, () => "una idea simple").join(". ")
const GUION = `${CUERPO}.\n\n${CIERRE}`
const TEXTO = `Hablemos de límites con calma. ${AVISO_AVATAR}`

function revisar(cambios: Partial<Parameters<typeof revisarGuion>[0]> = {}): Hallazgo[] {
  return revisarGuion({
    guion: GUION,
    texto: TEXTO,
    esAvatar: true,
    requiereLineasAyuda: false,
    ajeno: SIN_AJENO,
    ...cambios,
  })
}

function reglas(hallazgos: Hallazgo[]): string[] {
  return hallazgos.map((h) => h.regla)
}

describe("revisarGuion", () => {
  it("returns nothing for a script and caption that follow every rule", () => {
    expect(revisar()).toEqual([])
  })

  it("blocks a script that does not end with the fixed closing", () => {
    const hallazgos = revisar({ guion: `${CUERPO}. Gracias por ver este video.` })
    expect(hallazgos).toEqual([
      { regla: "cierre", tipo: "bloquea", mensaje: "El guion tiene que terminar con «Soy Coni del Rosario.»" },
    ])
  })

  it("accepts trailing blank lines after the closing", () => {
    expect(revisar({ guion: `${GUION}\n\n  \n` })).toEqual([])
  })

  it("blocks a closing that only appears in the middle of the script", () => {
    expect(reglas(revisar({ guion: `${CIERRE} ${CUERPO}.` }))).toEqual(["cierre"])
  })

  it.each([
    ["an emoji", "Qué bueno 😊 verlo", "😊"],
    ["a heart emoji", "Con amor ❤️ siempre", "❤"],
    ["a hashtag", "Mira esto #amor", "#"],
    ["an at sign", "Escríbeme a @coni", "@"],
    ["an asterisk", "Una *idea* simple", "*"],
    ["an underscore", "Una_idea simple", "_"],
    ["a tilde", "Una ~idea simple", "~"],
    ["a caret", "Una ^idea simple", "^"],
    ["an equals sign", "Dos = uno", "="],
    ["a less-than sign", "Uno < dos", "<"],
    ["a greater-than sign", "Dos > uno", ">"],
    ["an opening brace", "Una {idea simple", "{"],
    ["a closing brace", "Una idea} simple", "}"],
    ["an opening bracket", "Una [idea simple", "["],
    ["a closing bracket", "Una idea] simple", "]"],
    ["a backslash", "Una \\idea simple", "\\"],
    ["a pipe", "Una | idea simple", "|"],
    ["a slash", "Y/o una idea", "/"],
    ["a percent sign", "Casi todo es 100%", "%"],
    ["a dollar sign", "Cuesta $ mucho", "$"],
    ["an ampersand", "Tú & yo", "&"],
    ["a plus sign", "Uno + uno", "+"],
  ])("blocks %s in the script and names the first offending character", (_nombre, frase, esperado) => {
    const hallazgos = revisar({ guion: `${CUERPO}. ${frase}.\n\n${CIERRE}` })
    const simbolo = hallazgos.find((h) => h.regla === "simbolos")
    expect(simbolo).toEqual({
      regla: "simbolos",
      tipo: "bloquea",
      mensaje: "Sin emojis, hashtags ni símbolos en el guion: van solo en la publicación.",
      frase: esperado,
    })
  })

  it("allows Spanish punctuation, quotes and accents in the script", () => {
    const guion = `¿Sabías que "calma" no es lo mismo que silencio? ¡Claro que no! Mira: (con cuidado), sí; tal vez… ${CUERPO}.\n\n${CIERRE}`
    expect(reglas(revisar({ guion }))).not.toContain("simbolos")
  })

  it("does not block symbols in the caption, where they belong", () => {
    expect(revisar({ texto: `Con amor 😊 #avatar @coni. ${AVISO_AVATAR}` })).toEqual([])
  })

  it("blocks a caption without the avatar notice when the video is an avatar", () => {
    const hallazgos = revisar({ texto: "Hablemos de límites con calma." })
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]).toMatchObject({ regla: "aviso_avatar", tipo: "bloquea" })
    expect(hallazgos[0]?.mensaje).toContain(AVISO_AVATAR)
  })

  it("does not ask for the avatar notice when the video is not an avatar", () => {
    expect(revisar({ texto: "Hablemos de límites con calma.", esAvatar: false })).toEqual([])
  })

  it("blocks a caption without the help lines when the topic needs them", () => {
    const hallazgos = revisar({ requiereLineasAyuda: true })
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]).toMatchObject({ regla: "lineas_ayuda", tipo: "bloquea" })
  })

  it.each([
    ["1455", `Escribe aquí. ${LINEAS_AYUDA.replace("Fono 1455", "Fono")} ${AVISO_AVATAR}`],
    ["*4141", `Escribe aquí. ${LINEAS_AYUDA.replace("*4141", "4141")} ${AVISO_AVATAR}`],
    ["133", `Escribe aquí. ${LINEAS_AYUDA.replace("133", "")} ${AVISO_AVATAR}`],
  ])("blocks a caption that has the help lines but misses %s", (_numero, texto) => {
    expect(reglas(revisar({ requiereLineasAyuda: true, texto }))).toEqual(["lineas_ayuda"])
  })

  it("accepts a caption with the three help lines", () => {
    expect(revisar({ requiereLineasAyuda: true, texto: `${TEXTO}\n\n${LINEAS_AYUDA}` })).toEqual([])
  })

  it("does not ask for the help lines when the topic does not need them", () => {
    expect(reglas(revisar({ requiereLineasAyuda: false }))).not.toContain("lineas_ayuda")
  })

  it("warns, without blocking, when the script has fewer than 75 words", () => {
    const guion = `Una idea simple.\n\n${CIERRE}`
    const hallazgos = revisar({ guion })
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]).toMatchObject({ regla: "largo", tipo: "advierte" })
    expect(hallazgos[0]?.mensaje).toContain("7 palabras")
    expect(bloquea(hallazgos)).toBe(false)
  })

  it("warns when the script has more than 150 words", () => {
    const guion = `${Array.from({ length: 60 }, () => "una idea simple").join(". ")}.\n\n${CIERRE}`
    const hallazgos = revisar({ guion })
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]).toMatchObject({ regla: "largo", tipo: "advierte" })
    expect(hallazgos[0]?.mensaje).toContain("184 palabras")
  })

  it.each([
    [75, false],
    [150, false],
    [74, true],
    [151, true],
  ])("treats a script of %i words as out of range: %s", (cantidad, fuera) => {
    const relleno = Array.from({ length: cantidad - 4 }, () => "idea").join(" ")
    const guion = `${relleno} ${CIERRE}`
    expect(reglas(revisar({ guion })).includes("largo")).toBe(fuera)
  })

  it("warns about digits and names the number", () => {
    const hallazgos = revisar({ guion: `${CUERPO}. Mira estas 3 señales.\n\n${CIERRE}` })
    const numeros = hallazgos.find((h) => h.regla === "numeros")
    expect(numeros).toEqual({
      regla: "numeros",
      tipo: "advierte",
      mensaje: "Escribe los números con palabras (tres señales, no 3 señales).",
      frase: "3",
    })
  })

  it("reports every failing rule in a stable order", () => {
    const hallazgos = revisar({
      guion: "Mira 3 señales #amor.",
      texto: "Sin aviso",
      requiereLineasAyuda: true,
    })
    expect(reglas(hallazgos)).toEqual(["cierre", "simbolos", "aviso_avatar", "lineas_ayuda", "largo", "numeros"])
  })
})

describe("bloquea", () => {
  it("is true when any finding blocks", () => {
    expect(bloquea([{ regla: "largo", tipo: "advierte", mensaje: "x" }])).toBe(false)
    expect(
      bloquea([
        { regla: "largo", tipo: "advierte", mensaje: "x" },
        { regla: "cierre", tipo: "bloquea", mensaje: "y" },
      ]),
    ).toBe(true)
    expect(bloquea([])).toBe(false)
  })

  it("does not block on Claude findings, which only warn", () => {
    expect(bloquea([{ regla: "diagnostico", tipo: "advierte", mensaje: "x", frase: "tienes ansiedad" }])).toBe(false)
  })
})

describe("pideLineasDeAyuda", () => {
  it("is true when the idea carries a help-lines alert", () => {
    expect(pideLineasDeAyuda([{ tipo: "nota", texto: "a" }])).toBe(false)
    expect(
      pideLineasDeAyuda([
        { tipo: "nota", texto: "a" },
        { tipo: "líneas de ayuda", texto: "b" },
      ]),
    ).toBe(true)
    expect(pideLineasDeAyuda([])).toBe(false)
  })
})

describe("guiones reales", () => {
  const REELS = ["2026-09-25-taller-propia-diosa", "2026-09-30-deseo-se-esconde"]

  function leer(reel: string): string {
    return readFileSync(new URL(`../fixtures/goldens/${reel}/guion.txt`, import.meta.url), "utf-8")
  }

  it.each(REELS)("%s passes every rule with a caption that carries the avatar notice", (reel) => {
    expect(
      revisarGuion({ guion: leer(reel), texto: TEXTO, esAvatar: true, requiereLineasAyuda: false, ajeno: SIN_AJENO }),
    ).toEqual([])
  })

  it.each(REELS)("%s only fails the caption check when the notice is missing", (reel) => {
    const hallazgos = revisarGuion({
      guion: leer(reel),
      texto: "Sin aviso",
      esAvatar: true,
      requiereLineasAyuda: false,
      ajeno: SIN_AJENO,
    })
    expect(reglas(hallazgos)).toEqual(["aviso_avatar"])
    expect(bloquea(hallazgos)).toBe(true)
  })
})

describe("tramosCopiados", () => {
  it("finds 8 words in a row taken from a quote, ignoring case, accents and punctuation", () => {
    const texto = "Te cuento algo: el DESEO no se apaga; se esconde debajo de la rutina. Así que cuídalo."
    expect(tramosCopiados(texto, [CITA])).toEqual(["el DESEO no se apaga; se esconde debajo de la rutina"])
  })

  it("ignores accents both ways", () => {
    expect(
      tramosCopiados("esta pasando que el animo baja cuando nadie te mira", [
        "Está pasando que el ánimo baja cuando nadie te mira",
      ]),
    ).toEqual(["esta pasando que el animo baja cuando nadie te mira"])
  })

  it("lets 7 words in a row pass", () => {
    expect(LARGO_DE_COPIA).toBe(8)
    expect(tramosCopiados("Mira: el deseo no se apaga, se esconde. Y vuelve.", [CITA])).toEqual([])
  })

  it("reports each copied run once, as written in the text", () => {
    const run = "se esconde debajo de la rutina y del cansancio"
    expect(tramosCopiados(`${run}. Otra cosa. ${run}.`, [CITA])).toEqual([run])
  })

  it("finds nothing without quotes", () => {
    expect(tramosCopiados(CITA, [])).toEqual([])
  })
})

describe("autoresNombrados", () => {
  it("finds a full author name regardless of case and accents", () => {
    expect(autoresNombrados("Como dice esther perel, el deseo necesita aire.", ["Esther Perel"])).toEqual([
      "esther perel",
    ])
  })

  it("does not flag a single word of the name or names shorter than 4 letters", () => {
    expect(autoresNombrados("Perel no aparece entera aquí, ni la OMS.", ["Esther Perel", "OMS"])).toEqual([])
  })
})

describe("revisarGuion con respaldo", () => {
  it("warns once, without blocking, when the script and the caption copy the same quote", () => {
    const copia = "el deseo no se apaga, se esconde debajo de la rutina"
    const hallazgos = revisar({
      guion: `${copia}. ${GUION}`,
      texto: `${copia}. ${TEXTO}`,
      ajeno: { citas: [CITA], autores: [] },
    })
    const copias = hallazgos.filter((h) => h.regla === "copia_de_fuente")
    expect(copias).toEqual([
      {
        regla: "copia_de_fuente",
        tipo: "advierte",
        mensaje: "Esta frase repite palabra por palabra una de las fuentes. Dila con tus palabras.",
        frase: copia,
      },
    ])
    expect(bloquea(hallazgos)).toBe(false)
  })

  it("warns when an author of the backing is named", () => {
    const hallazgos = revisar({
      guion: `Según Esther Perel, ${GUION}`,
      ajeno: { citas: [], autores: ["Esther Perel"] },
    })
    expect(hallazgos.filter((h) => h.regla === "nombra_autor")).toEqual([
      {
        regla: "nombra_autor",
        tipo: "advierte",
        mensaje: "Aquí aparece el nombre de una fuente. En el reel no se nombran autores: dilo sin nombrarla.",
        frase: "Esther Perel",
      },
    ])
  })

  it("adds nothing when there is no backing", () => {
    expect(revisar({ ajeno: SIN_AJENO })).toEqual([])
  })

  it("reads stored findings of the new rules", () => {
    const guardada = [
      { regla: "copia_de_fuente", tipo: "advierte", mensaje: "m", frase: "f" },
      { regla: "nombra_autor", tipo: "advierte", mensaje: "m" },
    ]
    expect(leerRevision(guardada)).toHaveLength(2)
  })
})
