// @vitest-environment node
// Reads the golden scripts through import.meta.url, which jsdom does not support.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { revisionAJson } from "@/lib/datos/repositorio"
import { leerRevision } from "@/lib/datos/revision"
import {
  AVISO_AVATAR,
  AVISO_AVATAR_LINKEDIN,
  autoresNombrados,
  bloquea,
  CIERRE,
  etiquetarJuiciosDeClaude,
  type Hallazgo,
  hallazgosDeLaAprobacion,
  LARGO_DE_COPIA,
  LINEAS_AYUDA,
  pideLineasDeAyuda,
  revisarGuion,
  revisarLinkedinSiHay,
  revisarTextoLinkedin,
  sinLinkedin,
  tramosCopiados,
} from "@/lib/dominio/revision"

const SIN_AJENO = { citas: [], autores: [], personas: [], citadas: [] }
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

describe("sugiere_consulta", () => {
  const PREGUNTA = "¿En qué momento del día te cuesta más desconectarte?"
  const linkedinCon = (frase: string) =>
    `${frase}\n\n${Array.from({ length: 12 }, () => "Cuando hablamos de límites conviene partir por lo que sí podemos observar en la rutina de cada día.").join("\n\n")}\n\n${PREGUNTA}\n\n${AVISO_AVATAR_LINKEDIN}\n\n#limites`

  const REAL = "Muchas personas me cuentan que comen juntas a diario."

  it.each([
    "Muchas personas me cuentan que comen juntas a diario.",
    "Me contaron que ya no se tocan.",
    "Me dicen que no tienen ganas.",
    "Una pareja me dijo que lo intentó todo.",
    "Me dijeron que era normal.",
    "Muchas personas me escriben con la misma duda.",
    "Me escribieron por esto la semana pasada.",
    "En consulta veo esto seguido.",
    "En mi consulta veo esto seguido.",
    "Mis pacientes lo repiten mucho.",
    "Mis consultantes lo repiten mucho.",
    "Una paciente me habló de esto.",
    "Un paciente llegó muy ansioso.",
    "Una consultante lo vivió así.",
    "Un consultante lo vivió así.",
    "Me ha tocado ver parejas que no se hablan.",
    "Me ha tocado acompañar a quienes duermen mal.",
    "ME CUENTAN que todo cambia.",
  ])("warns that «%s» suggests a real consultation, in the script, the caption and the LinkedIn text", (frase) => {
    const deGuion = revisar({ guion: GUION.replace("una idea simple", frase) })
    const deTexto = revisar({ texto: `${frase} ${AVISO_AVATAR}` })
    const deLinkedin = revisarTextoLinkedin({
      texto: linkedinCon(frase),
      esAvatar: true,
      requiereLineasAyuda: false,
      ajeno: SIN_AJENO,
    })

    for (const hallazgos of [deGuion, deTexto, deLinkedin]) {
      const hallazgo = hallazgos.find((h) => h.regla === "sugiere_consulta")
      expect(hallazgo?.tipo).toBe("advierte")
      expect(frase.toLowerCase()).toContain((hallazgo?.frase ?? "\u0000").toLowerCase())
    }
    expect(deLinkedin.find((h) => h.regla === "sugiere_consulta")?.campo).toBe("linkedin")
  })

  it("explains it in es-CL, in tú and without long dashes", () => {
    const hallazgo = revisarTextoLinkedin({
      texto: linkedinCon(REAL),
      esAvatar: true,
      requiereLineasAyuda: false,
      ajeno: SIN_AJENO,
    }).find((h) => h.regla === "sugiere_consulta")

    expect(hallazgo?.mensaje).toBe(
      "Esto sugiere que hablas de personas que atiendes. Dilo en general, sin que parezca una consulta real.",
    )
    expect(hallazgo?.frase).toBe("me cuentan")
  })

  it.each([
    "Conviene conversar con una profesional.",
    "Conviene consultar con un especialista.",
    "¿Me cuentas en los comentarios?",
    "Cuéntame en los comentarios qué te pasa.",
    "Si me escribes, te respondo.",
    "Si tú me dices que sí, empezamos.",
    "Es súper común que a muchas personas les pase.",
    "El paciente de un estudio clásico.",
    "Ir a consultas médicas regulares ayuda.",
    "Me tocó ver esa serie con mi pareja.",
  ])("leaves «%s» alone", (frase) => {
    expect(
      reglas(revisar({ guion: GUION.replace("una idea simple", frase), texto: `${frase} ${AVISO_AVATAR}` })),
    ).not.toContain("sugiere_consulta")
    expect(
      reglas(
        revisarTextoLinkedin({
          texto: linkedinCon(frase),
          esAvatar: true,
          requiereLineasAyuda: false,
          ajeno: SIN_AJENO,
        }),
      ),
    ).not.toContain("sugiere_consulta")
  })

  it("reports one finding per phrase even when the script and the caption share it", () => {
    const hallazgos = revisar({ guion: GUION.replace("una idea simple", REAL), texto: `${REAL} ${AVISO_AVATAR}` })
    expect(reglas(hallazgos).filter((r) => r === "sugiere_consulta")).toEqual(["sugiere_consulta"])
  })

  it("never blocks", () => {
    const hallazgos = revisar({ guion: GUION.replace("una idea simple", REAL) })
    expect(bloquea(hallazgos)).toBe(false)
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
      ajeno: { citas: [CITA], autores: [], personas: [], citadas: [] },
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
      ajeno: { citas: [], autores: ["Esther Perel"], personas: ["Esther Perel"], citadas: [] },
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

  describe("cited sources", () => {
    // "OMS" is too short to be looked for at all (four letters at least), so the cited source here is Stanford.
    const AJENO = { citas: [], autores: ["Ana Pérez", "Stanford"], personas: ["Ana Pérez"], citadas: ["Stanford"] }

    it("still warns when the spoken script names a cited source", () => {
      const h = revisar({ guion: `Según Stanford, hoy hablamos de esto. ${GUION}`, ajeno: AJENO })
      expect(h.filter((x) => x.regla === "nombra_autor").map((x) => x.frase)).toEqual(["Stanford"])
    })

    it("accepts the cited source in the caption and warns on another backing author", () => {
      const texto = `Lo dice Pérez.\n\nFuente: Stanford · Informe\n\n${AVISO_AVATAR}`
      const nombrados = revisar({ texto, ajeno: AJENO }).filter((x) => x.regla === "nombra_autor")
      expect(nombrados.map((x) => x.frase)).toEqual(["Pérez"])
      expect(nombrados[0]?.mensaje).toBe(
        "Aquí aparece el nombre de una fuente que no citas. Nómbrala solo si es una de las fuentes citadas.",
      )
    })

    it("reports a phrase once when the script and the caption both name it", () => {
      const nombrados = revisar({
        guion: `Lo dice Pérez. ${GUION}`,
        texto: `Lo dice Pérez. ${AVISO_AVATAR}`,
        ajeno: AJENO,
      }).filter((x) => x.regla === "nombra_autor")
      expect(nombrados.map((x) => x.frase)).toEqual(["Pérez"])
    })
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
  const GANCHO = "Llevan diez años juntos y ya casi no se tocan."
  const PARRAFO = "Cuando hablamos de límites conviene partir por lo que sí podemos observar en la rutina de cada día."
  const PREGUNTA = "¿En qué momento del día te cuesta más desconectarte?"
  const HASHTAGS = "#limites #psicologia"

  /** A text that follows every rule: the hook, short paragraphs, one question, the notice, two hashtags. */
  function textoLinkedin(
    partes: { gancho?: string; parrafos?: number; pregunta?: string | null; aviso?: string; hashtags?: string } = {},
  ): string {
    const {
      gancho = GANCHO,
      parrafos = 12,
      pregunta = PREGUNTA,
      aviso = AVISO_AVATAR_LINKEDIN,
      hashtags = HASHTAGS,
    } = partes
    return [
      gancho,
      ...Array.from({ length: parrafos }, () => PARRAFO),
      ...(pregunta === null ? [] : [pregunta]),
      aviso,
      hashtags,
    ]
      .filter((parte) => parte !== "")
      .join("\n\n")
  }

  const OK = textoLinkedin()

  function revisarLinkedin(cambios: Partial<Parameters<typeof revisarTextoLinkedin>[0]> = {}): Hallazgo[] {
    return revisarTextoLinkedin({
      texto: OK,
      esAvatar: true,
      requiereLineasAyuda: false,
      ajeno: SIN_AJENO,
      ...cambios,
    })
  }

  /** The rules of the findings for a text, to say what a case does and does not trigger. */
  const reglasDe = (texto: string, extra: Partial<Parameters<typeof revisarTextoLinkedin>[0]> = {}) =>
    reglas(revisarLinkedin({ texto, ...extra }))

  it("keeps the reference text clean: it is long enough, with one question and the fixed notice", () => {
    expect([...OK].length).toBeGreaterThan(1300)
    expect([...OK].length).toBeLessThan(2500)
    expect(revisarLinkedin()).toEqual([])
  })

  describe("the avatar notice", () => {
    it("blocks a text without the fixed LinkedIn notice and names the line she has to use", () => {
      const hallazgos = revisarLinkedin({ texto: textoLinkedin({ aviso: "" }) })
      expect(hallazgos).toEqual([
        {
          regla: "aviso_avatar",
          tipo: "bloquea",
          mensaje: `El texto para LinkedIn tiene que avisar que es un avatar digital: «${AVISO_AVATAR_LINKEDIN}»`,
          campo: "linkedin",
        },
      ])
    })

    it("does not take the Instagram notice for the LinkedIn one", () => {
      expect(reglasDe(textoLinkedin({ aviso: AVISO_AVATAR }))).toEqual(["aviso_avatar"])
    })

    it("uses the sentence the research fixed, word for word", () => {
      expect(AVISO_AVATAR_LINKEDIN).toBe(
        "Este video lo narra mi avatar digital, creado con IA a partir de mi imagen y mi voz. El contenido lo revisé y aprobé yo.",
      )
    })

    it("does not ask for the notice when the video is not an avatar", () => {
      expect(reglasDe(textoLinkedin({ aviso: "" }), { esAvatar: false })).toEqual([])
    })
  })

  describe("what blocks", () => {
    it("blocks when the help lines are required and missing, and passes when they are there", () => {
      expect(reglasDe(OK, { requiereLineasAyuda: true })).toEqual(["lineas_ayuda"])
      expect(
        reglasDe(textoLinkedin({ aviso: `${LINEAS_AYUDA}\n\n${AVISO_AVATAR_LINKEDIN}` }), {
          requiereLineasAyuda: true,
        }),
      ).toEqual([])
    })

    it("blocks a known tone mark", () => {
      const hallazgos = revisarLinkedin({ texto: `[calm] ${OK}` })
      expect(hallazgos).toEqual([
        expect.objectContaining({ regla: "etiqueta_en_texto", tipo: "bloquea", frase: "[calm]", campo: "linkedin" }),
      ])
    })

    it("blocks a text over 3000 characters and accepts one of exactly 3000", () => {
      const relleno = (largo: number) => `${OK}\n\n${"a".repeat(largo - [...OK].length - 2)}`
      expect(reglasDe(relleno(3001))).toContain("largo_linkedin")
      expect(reglasDe(relleno(3000))).not.toContain("largo_linkedin")
      expect(bloquea(revisarLinkedin({ texto: relleno(3001) }))).toBe(true)
    })

    it("warns, and never blocks, for everything else", () => {
      const sucio = `no es cansancio, es costumbre. comenta SÍ. https://ejemplo.cl ¿a? ¿b? podís ${"😀".repeat(5)} #a #b #c #d`
      const hallazgos = revisarLinkedin({ texto: `${sucio}\n\n${AVISO_AVATAR_LINKEDIN}` })
      expect(hallazgos.length).toBeGreaterThan(5)
      expect(bloquea(hallazgos)).toBe(false)
    })
  })

  describe("length", () => {
    it("warns below 1000 characters and says how long it should be", () => {
      const corto = revisarLinkedin({ texto: textoLinkedin({ parrafos: 3 }) })
      expect(corto).toEqual([
        expect.objectContaining({ regla: "largo_corto_linkedin", tipo: "advierte", campo: "linkedin" }),
      ])
      expect(corto[0]?.mensaje).toContain("de 1.300 a 2.500")
    })

    it("accepts a text between 1000 and 1300 characters without a warning", () => {
      const texto = textoLinkedin({ parrafos: 8 })
      expect([...texto].length).toBeGreaterThanOrEqual(1000)
      expect([...texto].length).toBeLessThan(1300)
      expect(reglasDe(texto)).toEqual([])
    })
  })

  describe("the hook", () => {
    it("warns when the first paragraph does not fit in 140 characters", () => {
      const largo = `${"Una escena que se alarga demasiado antes de decir de qué trata de verdad este post".repeat(2)}.`
      expect(reglasDe(textoLinkedin({ gancho: largo }))).toEqual(["gancho_linkedin"])
    })

    it("warns when the first paragraph takes more than two lines even if it is short", () => {
      expect(reglasDe(textoLinkedin({ gancho: "Uno.\nDos.\nTres." }))).toEqual(["gancho_linkedin"])
    })

    it("accepts a hook of exactly 140 characters on one or two lines", () => {
      expect(reglasDe(textoLinkedin({ gancho: "a".repeat(140) }))).toEqual([])
      expect(reglasDe(textoLinkedin({ gancho: `${"a".repeat(60)}\n${"b".repeat(79)}` }))).toEqual([])
    })
  })

  describe("hashtags", () => {
    it("warns, and does not block, when there are more than three hashtags", () => {
      const hallazgos = revisarLinkedin({ texto: textoLinkedin({ hashtags: "#a #b #c #d" }) })
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

    it("accepts no hashtags, exactly three, and a number sign that is not a hashtag", () => {
      expect(reglasDe(textoLinkedin({ hashtags: "" }))).toEqual([])
      expect(reglasDe(textoLinkedin({ hashtags: "#a #b #c" }))).toEqual([])
      expect(reglasDe(textoLinkedin({ hashtags: "Somos el número # uno" }))).toEqual([])
    })
  })

  describe("emojis", () => {
    it("accepts up to three and warns from the fourth", () => {
      expect(reglasDe(textoLinkedin({ gancho: `${GANCHO} ✅📌✅` }))).toEqual([])
      expect(reglasDe(textoLinkedin({ gancho: `${GANCHO} ✅📌✅📌` }))).toEqual(["emojis_linkedin"])
    })

    it.each(["1️⃣ Primero", "Paso 2⃣", "🔟 ideas"])("blocks a numbered emoji: %s", (linea) => {
      const hallazgos = revisarLinkedin({ texto: `${OK}\n${linea}` })
      const keycap = hallazgos.find((h) => h.regla === "formato_linkedin" && h.tipo === "bloquea")
      expect(keycap?.mensaje).toBe(
        "En LinkedIn las listas van con números normales («1.») o en prosa, sin emojis numerados.",
      )
    })

    it("does not count a keycap again as one of the three emojis", () => {
      expect(reglasDe(`${OK}\n✅ 📌 ✅ 1️⃣`)).not.toContain("emojis_linkedin")
    })

    it("leaves a plain numbered list alone", () => {
      expect(reglasDe(`${OK}\n1. Primero\n2. Segundo`)).not.toContain("formato_linkedin")
    })

    it("warns for any emoji in a sensitive topic", () => {
      const conUno = textoLinkedin({ aviso: `${LINEAS_AYUDA}\n\n${AVISO_AVATAR_LINKEDIN} ✅` })
      expect(reglasDe(conUno, { requiereLineasAyuda: true })).toEqual(["emojis_linkedin"])
      expect(reglasDe(conUno, { requiereLineasAyuda: false })).toEqual([])
    })
  })

  describe("the closing question", () => {
    it("warns when there is no question and when there is more than one", () => {
      expect(reglasDe(textoLinkedin({ pregunta: null }))).toEqual(["pregunta_linkedin"])
      expect(reglasDe(textoLinkedin({ pregunta: "¿Primera? ¿Segunda?" }))).toEqual(["pregunta_linkedin"])
    })

    it("accepts exactly one", () => {
      expect(reglasDe(OK)).toEqual([])
    })
  })

  describe("links", () => {
    it.each(["https://ejemplo.cl/guia", "http://ejemplo.cl", "www.ejemplo.cl", "ejemplo.com/guia"])(
      "warns about %s in the body",
      (enlace) => {
        const hallazgos = revisarLinkedin({ texto: textoLinkedin({ gancho: `${GANCHO} ${enlace}` }) })
        expect(reglas(hallazgos)).toEqual(["enlace_linkedin"])
        expect(hallazgos[0]?.frase).toBe(enlace)
      },
    )

    it("lets a plain sentence through", () => {
      expect(reglasDe(textoLinkedin({ gancho: "Hay veces que el cansancio pesa más. Y está bien." }))).toEqual([])
    })
  })

  describe("the contrast formula", () => {
    it.each([
      "No es cansancio, es costumbre.",
      "No es falta de ganas: es falta de espacio.",
      "No se trata de tener tiempo, sino de decidir cómo usarlo.",
      "La pelea no es el problema. El problema es cómo termina.",
      "El problema no es la pelea.",
      "El deseo no se apaga: se esconde.",
      "Esto no está roto: está cansado.",
    ])("warns about «%s»", (frase) => {
      const hallazgos = revisarLinkedin({ texto: textoLinkedin({ gancho: frase }) })
      expect(reglas(hallazgos)).toEqual(["contraste_linkedin"])
      expect(hallazgos[0]).toMatchObject({ tipo: "advierte", campo: "linkedin" })
    })

    it("gives the matched phrase so Coni finds it", () => {
      const hallazgos = revisarLinkedin({ texto: textoLinkedin({ gancho: "No es cansancio, es costumbre." }) })
      expect(hallazgos[0]?.frase).toMatch(/^No es cansancio, es/i)
    })

    it.each([
      "No es lo mismo cansancio que tristeza.",
      "Esto no es un diagnóstico.",
      "A veces es cansancio y a veces es costumbre.",
    ])("leaves «%s» alone", (frase) => {
      expect(reglasDe(textoLinkedin({ gancho: frase }))).toEqual([])
    })
  })

  describe("engagement bait", () => {
    it.each([
      "Comenta SÍ si te pasa.",
      "Comenta «GUÍA» y te la mando.",
      "Dale like si estás de acuerdo.",
      "Reacciona con 👏 si te sirvió.",
      "Etiqueta a tres amigas que lo necesitan.",
      "Comparte si estás de acuerdo.",
      "Vota con una reacción.",
    ])("warns about «%s»", (frase) => {
      const hallazgos = revisarLinkedin({ texto: textoLinkedin({ gancho: frase }) })
      expect(reglas(hallazgos)).toContain("bait_linkedin")
      expect(hallazgos.find((h) => h.regla === "bait_linkedin")).toMatchObject({ tipo: "advierte", campo: "linkedin" })
    })

    it("lets a normal call to reply through", () => {
      expect(reglasDe(textoLinkedin({ gancho: "Cuéntame en los comentarios qué te ha servido." }))).toEqual([])
    })
  })

  describe("false positives and the en dash", () => {
    it.each([
      "Hay que ponerle una etiqueta a tu pareja y eso no ayuda.",
      "Le pusieron una etiqueta a Mariana en el colegio.",
      "Cuando alguien te dice etiqueta a esa persona, piénsalo dos veces.",
    ])("leaves «%s» alone", (frase) => {
      expect(reglasDe(textoLinkedin({ gancho: frase }))).not.toContain("bait_linkedin")
    })

    it.each([
      "Etiqueta a alguien que lo necesite.",
      "Comparte esto. Etiqueta a tu amiga.",
      "Dale like y etiqueta a un amigo.",
      "Etiqueta a quien lo necesite.",
    ])("still catches the imperative «%s»", (frase) => {
      expect(reglasDe(textoLinkedin({ gancho: frase }))).toContain("bait_linkedin")
    })

    it("warns about the en dash like the long dash", () => {
      expect(reglasDe(textoLinkedin({ gancho: "Los límites \u2013 y la calma" }))).toEqual(["formato_linkedin"])
    })

    it("does not count ©, ® or ™ as emojis", () => {
      expect(reglasDe(textoLinkedin({ gancho: `${GANCHO} © ® ™ © ®` }))).toEqual([])
    })

    it("does not count a question mark inside a link as the closing question", () => {
      const conLink = textoLinkedin({ gancho: `${GANCHO} Mira https://ejemplo.cl/guia?id=1&x=2` })
      expect(reglas(revisarLinkedin({ texto: conLink }))).toEqual(["enlace_linkedin"])
    })
  })

  describe("format and address", () => {
    it("warns about letters in Unicode bold or italic and about the long dash", () => {
      expect(reglasDe(textoLinkedin({ gancho: "𝗟𝗼𝘀 𝗹𝗶́𝗺𝗶𝘁𝗲𝘀 importan" }))).toEqual(["formato_linkedin"])
      expect(reglasDe(textoLinkedin({ gancho: "Los límites \u2014 y la calma" }))).toEqual(["formato_linkedin"])
    })

    it.each(["podís", "sabís", "cachai", "querís", "tenís"])("warns about the voseo «%s»", (verbo) => {
      const hallazgos = revisarLinkedin({ texto: textoLinkedin({ gancho: `Tú ${verbo} cuándo parar.` }) })
      expect(reglas(hallazgos)).toEqual(["trato_linkedin"])
      expect(hallazgos[0]?.frase).toBe(verbo)
    })

    it("warns about the formal «usted» and lets «ustedes» and the normative tú through", () => {
      expect(reglasDe(textoLinkedin({ gancho: "Si usted siente cansancio, pare." }))).toEqual(["trato_linkedin"])
      expect(reglasDe(textoLinkedin({ gancho: "Si ustedes sienten cansancio, paren. Tú puedes parar." }))).toEqual([])
    })
  })

  describe("what comes from the backing", () => {
    it("accepts the cited source in the LinkedIn text", () => {
      const ajeno = { citas: [], autores: ["Ana Pérez", "Stanford"], personas: ["Ana Pérez"], citadas: ["Stanford"] }
      const h = revisarLinkedin({ texto: `${OK}\nComo muestra Stanford en su informe.`, ajeno })
      expect(h.some((x) => x.regla === "nombra_autor")).toBe(false)
    })

    it("warns when an author of the backing is named or a quote is copied", () => {
      const ajeno = { citas: [CITA], autores: ["Esther Perel"], personas: [], citadas: [] }
      const hallazgos = revisarLinkedin({
        texto: textoLinkedin({
          gancho: "Como dice Esther Perel: el deseo no se apaga, se esconde debajo de la rutina.",
        }),
        ajeno,
      })
      expect(hallazgos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            regla: "nombra_autor",
            tipo: "advierte",
            frase: "Esther Perel",
            campo: "linkedin",
          }),
          expect.objectContaining({ regla: "copia_de_fuente", tipo: "advierte", campo: "linkedin" }),
        ]),
      )
      expect(bloquea(hallazgos)).toBe(false)
    })
  })

  describe("storage", () => {
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
})

describe("the LinkedIn text of a piece that may not have one", () => {
  const resto = { esAvatar: true, requiereLineasAyuda: false, ajeno: SIN_AJENO }

  it("gives no findings when the piece has no LinkedIn text yet (pieces from before LinkedIn)", () => {
    expect(revisarLinkedinSiHay(null, resto)).toEqual([])
  })

  it("reviews the text when there is one", () => {
    expect(reglas(revisarLinkedinSiHay("Hola.", resto))).toContain("aviso_avatar")
  })

  it("keeps the findings of the script and the caption when the LinkedIn ones are left out", () => {
    const todos = [...revisar({ texto: "Hola." }), ...revisarLinkedinSiHay("Hola.", resto)]
    expect(sinLinkedin(todos)).toEqual(revisar({ texto: "Hola." }))
    expect(sinLinkedin(todos).every((h) => h.campo === undefined)).toBe(true)
    expect(todos.length).toBeGreaterThan(sinLinkedin(todos).length)
  })
})

describe("hallazgosDeLaAprobacion", () => {
  const delTexto: Hallazgo = { regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso." }
  const deLinkedin: Hallazgo = { regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso.", campo: "linkedin" }

  it("counts the LinkedIn findings only when LinkedIn is part of what is approved", () => {
    expect(hallazgosDeLaAprobacion([delTexto, deLinkedin], { linkedin: true })).toEqual([delTexto, deLinkedin])
    expect(hallazgosDeLaAprobacion([delTexto, deLinkedin], { linkedin: false })).toEqual([delTexto])
  })

  it("keeps Claude's judgments, which belong to no field, in both cases", () => {
    const juicio: Hallazgo = { regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "m", frase: "x" }
    expect(hallazgosDeLaAprobacion([juicio, deLinkedin], { linkedin: false })).toEqual([juicio])
  })
})

describe("etiquetarJuiciosDeClaude", () => {
  const textos = {
    guion: `[warm] Uno de cada diez lo vive.\n\n${CIERRE}`,
    texto: `Hablemos de límites. ${AVISO_AVATAR}`,
    textoLinkedin: "En consulta vemos que el ochenta por ciento mejora.\n\nUna pregunta final.",
  }
  const juicio = (frase: string): Hallazgo => ({ regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "m", frase })

  it("tags a finding whose phrase only appears in the LinkedIn text", () => {
    const [h] = etiquetarJuiciosDeClaude([juicio("el ochenta por ciento mejora")], textos)
    expect(h).toMatchObject({ campo: "linkedin" })
  })

  it("leaves a finding of the script or the caption without a field, tone marks and spacing aside", () => {
    const hallazgos = etiquetarJuiciosDeClaude(
      [juicio("Uno de cada diez lo vive"), juicio("Hablemos  de límites")],
      textos,
    )
    expect(hallazgos.map((h) => h.campo)).toEqual([undefined, undefined])
  })

  it("leaves a phrase that appears in both places, or in none, without a field", () => {
    const ambos = { ...textos, textoLinkedin: `${textos.textoLinkedin} Hablemos de límites.` }
    expect(etiquetarJuiciosDeClaude([juicio("Hablemos de límites")], ambos)[0]?.campo).toBeUndefined()
    expect(etiquetarJuiciosDeClaude([juicio("no está en ningún lado")], textos)[0]?.campo).toBeUndefined()
  })

  it("does nothing when the piece has no LinkedIn text", () => {
    expect(
      etiquetarJuiciosDeClaude([juicio("el ochenta por ciento")], { ...textos, textoLinkedin: null })[0]?.campo,
    ).toBeUndefined()
  })
})
