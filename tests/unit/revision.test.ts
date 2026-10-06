// @vitest-environment node
// Reads the golden scripts through import.meta.url, which jsdom does not support.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { revisionAJson } from "@/lib/datos/repositorio"
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
  revisarTextoLinkedin,
  tramosCopiados,
} from "@/lib/dominio/revision"

const SIN_AJENO = { citas: [], autores: [], personas: [] }
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

describe("autoresNombrados por apellido", () => {
  it("flags the last word of a persona with 5 or more letters, ignoring case and accents", () => {
    expect(autoresNombrados("Según GOTTMAN, el desprecio mata la pareja.", ["John Gottman"], ["John Gottman"])).toEqual(
      ["GOTTMAN"],
    )
    expect(autoresNombrados("Dice Pérez que sí.", ["Ana Perez"], ["Ana Perez"])).toEqual(["Pérez"])
  })

  it("does not flag a surname under 5 letters", () => {
    expect(autoresNombrados("Según Soto, hay que hablar.", ["Luis Soto"], ["Luis Soto"])).toEqual([])
  })

  it("does not flag the last word of an account or an institution (they are not in personas)", () => {
    expect(autoresNombrados("Las parejas felices comparten.", ["Instituto Parejas"], [])).toEqual([])
  })

  it("reports both the full name and the bare surname when each appears", () => {
    expect(autoresNombrados("John Gottman dice que Gottman tiene razón.", ["John Gottman"], ["John Gottman"])).toEqual([
      "John Gottman",
      "Gottman",
    ])
  })

  it("reports a full name once, without also flagging the surname inside it", () => {
    expect(autoresNombrados("Según John Gottman, sí.", ["John Gottman"], ["John Gottman"])).toEqual(["John Gottman"])
  })

  it("matches whole words only", () => {
    expect(autoresNombrados("Los gottmanistas opinan.", ["John Gottman"], ["John Gottman"])).toEqual([])
  })
})

describe("revisarGuion con respaldo", () => {
  it("warns once, without blocking, when the script and the caption copy the same quote", () => {
    const copia = "el deseo no se apaga, se esconde debajo de la rutina"
    const hallazgos = revisar({
      guion: `${copia}. ${GUION}`,
      texto: `${copia}. ${TEXTO}`,
      ajeno: { citas: [CITA], autores: [], personas: [] },
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
      ajeno: { citas: [], autores: ["Esther Perel"], personas: ["Esther Perel"] },
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

describe("revisarGuion with tone marks", () => {
  const marcas = (n: number) => Array.from({ length: n }, () => "[warm]").join(" ")

  it("accepts known marks: they are not symbols, words or a broken closing", () => {
    expect(revisar({ guion: `[warm] ${CUERPO}.\n\n[pause]\n[softly] ${CIERRE}` })).toEqual([])
  })

  it("still blocks a stray bracket that is not a mark", () => {
    expect(revisar({ guion: `Una [idea simple. ${GUION}` }).map((h) => h.regla)).toEqual(["simbolos"])
  })

  it("warns once per unknown mark, naming it", () => {
    expect(revisar({ guion: `[cálido] ${CUERPO}.\n\n[cálido] [warm] ${CIERRE}` })).toEqual([
      {
        regla: "etiqueta_desconocida",
        tipo: "advierte",
        mensaje: "Esta marca de tono no la conozco: [cálido]. Usa una de la lista o bórrala.",
        frase: "[cálido]",
      },
    ])
  })

  it("warns about more than six marks and accepts six", () => {
    expect(revisar({ guion: `${marcas(6)} ${GUION}` })).toEqual([])
    expect(revisar({ guion: `${marcas(7)} ${GUION}` })).toEqual([
      {
        regla: "muchas_etiquetas",
        tipo: "advierte",
        mensaje: "El guion tiene 7 marcas de tono. Con 3 a 6 la voz suena natural; con más suena actuada.",
      },
    ])
  })

  it("blocks a known mark in the caption, which is published as written", () => {
    const hallazgos = revisar({ texto: `[warm] ${TEXTO}` })
    expect(hallazgos).toEqual([
      {
        regla: "etiqueta_en_texto",
        tipo: "bloquea",
        mensaje: "Las marcas de tono van solo en el guion. Bórrala del texto de la publicación.",
        frase: "[warm]",
      },
    ])
    expect(bloquea(hallazgos)).toBe(true)
  })

  it("blocks a known mark in the caption whatever its capitalisation", () => {
    expect(revisar({ texto: `[Warm] ${TEXTO}` }).map((h) => h.frase)).toEqual(["[Warm]"])
  })

  it("leaves other bracketed text in the caption as it is today: no finding", () => {
    expect(revisar({ texto: `[cálido] ${TEXTO} [más info]` })).toEqual([])
  })

  it("finds a copied phrase even with a mark in the middle of it", () => {
    const copiado = "El deseo no se apaga, se [softly] esconde debajo de la rutina"
    const hallazgos = revisar({ guion: `${copiado}. ${GUION}`, ajeno: { ...SIN_AJENO, citas: [CITA] } })
    expect(hallazgos.filter((h) => h.regla === "copia_de_fuente").map((h) => h.frase)).toEqual([
      "El deseo no se apaga, se esconde debajo de la rutina",
    ])
  })

  it("stores and reads back the new findings", () => {
    const hallazgos = revisar({ guion: `[cálido] ${GUION}`, texto: `[warm] ${TEXTO}` })
    expect(leerRevision(JSON.parse(JSON.stringify(hallazgos)))).toEqual(hallazgos)
  })
})

describe("revisarTextoLinkedin", () => {
  const OK = `Una idea para colegas.\n\n#sexualidad #psicologia\n\n${AVISO_AVATAR}`

  function revisarLinkedin(cambios: Partial<Parameters<typeof revisarTextoLinkedin>[0]> = {}): Hallazgo[] {
    return revisarTextoLinkedin({
      texto: OK,
      esAvatar: true,
      requiereLineasAyuda: false,
      ajeno: SIN_AJENO,
      ...cambios,
    })
  }

  it("returns nothing for a text that follows every rule", () => {
    expect(revisarLinkedin()).toEqual([])
  })

  it("blocks a text without the avatar notice and says it is the LinkedIn text", () => {
    expect(revisarLinkedin({ texto: "Hola." })).toEqual([
      {
        regla: "aviso_avatar",
        tipo: "bloquea",
        mensaje: `El texto para LinkedIn tiene que avisar que es un avatar digital: «${AVISO_AVATAR}»`,
        campo: "linkedin",
      },
    ])
  })

  it("does not ask for the avatar notice when the video is not an avatar", () => {
    expect(revisarLinkedin({ texto: "Hola.", esAvatar: false })).toEqual([])
  })

  it("warns, and does not block, when there are more than three hashtags", () => {
    const hallazgos = revisarLinkedin({ texto: `Hola. #a #b #c #d\n${AVISO_AVATAR}` })
    expect(hallazgos).toEqual([
      {
        regla: "hashtags_linkedin",
        tipo: "advierte",
        mensaje: "En LinkedIn van como máximo 3 hashtags. Tiene 4.",
        campo: "linkedin",
      },
    ])
    expect(bloquea(hallazgos)).toBe(false)
  })

  it("accepts exactly three hashtags and ignores a number sign that is not a hashtag", () => {
    expect(revisarLinkedin({ texto: `Hola #a #b #c\n${AVISO_AVATAR}` })).toEqual([])
    expect(reglas(revisarLinkedin({ texto: `Somos el número # uno\n${AVISO_AVATAR}` }))).toEqual([])
  })

  it("blocks when the help lines are required and missing, and passes when they are there", () => {
    expect(reglas(revisarLinkedin({ requiereLineasAyuda: true }))).toEqual(["lineas_ayuda"])
    const conLineas = `Hola.\n${LINEAS_AYUDA}\n${AVISO_AVATAR}`
    expect(revisarLinkedin({ texto: conLineas, requiereLineasAyuda: true })).toEqual([])
  })

  it("blocks a known tone mark and a text over 3000 characters", () => {
    const texto = `[calm] ${"a".repeat(3000)}\n${AVISO_AVATAR}`
    const hallazgos = revisarLinkedin({ texto })
    expect(reglas(hallazgos).sort()).toEqual(["etiqueta_en_texto", "largo_linkedin"])
    expect(bloquea(hallazgos)).toBe(true)
  })

  it("accepts a text of exactly 3000 characters", () => {
    const texto = `${"a".repeat(3000 - AVISO_AVATAR.length - 1)}\n${AVISO_AVATAR}`
    expect([...texto]).toHaveLength(3000)
    expect(revisarLinkedin({ texto })).toEqual([])
  })

  it("warns when an author of the backing is named or a quote is copied", () => {
    const ajeno = { citas: [CITA], autores: ["Esther Perel"], personas: [] }
    const texto = `Como dice Esther Perel: el deseo no se apaga, se esconde debajo de la rutina.\n${AVISO_AVATAR}`
    const hallazgos = revisarLinkedin({ texto, ajeno })
    expect(hallazgos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ regla: "nombra_autor", tipo: "advierte", frase: "Esther Perel", campo: "linkedin" }),
        expect.objectContaining({ regla: "copia_de_fuente", tipo: "advierte", campo: "linkedin" }),
      ]),
    )
    expect(bloquea(hallazgos)).toBe(false)
  })

  it("tags every finding with the LinkedIn field and keeps the tag when stored and read back", () => {
    const hallazgos = revisarLinkedin({ texto: `[warm] Hola #a #b #c #d` })
    expect(hallazgos.length).toBeGreaterThan(1)
    expect(hallazgos.every((h) => h.campo === "linkedin")).toBe(true)
    expect(leerRevision(JSON.parse(JSON.stringify(revisionAJson(hallazgos))))).toEqual(hallazgos)
  })

  it("keeps findings of the caption without a field, as today", () => {
    const hallazgos = revisar({ texto: "Hola." })
    expect(hallazgos.every((h) => h.campo === undefined)).toBe(true)
    expect(leerRevision(JSON.parse(JSON.stringify(revisionAJson(hallazgos))))).toEqual(hallazgos)
  })
})
