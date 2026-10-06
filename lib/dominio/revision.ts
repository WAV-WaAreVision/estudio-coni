import { palabras } from "@/lib/dominio/estimaciones"
import { etiquetasDe, MAXIMO_DE_ETIQUETAS, MINIMO_DE_ETIQUETAS, sinEtiquetas } from "@/lib/dominio/etiquetas"

export const REGLAS_DETERMINISTAS = [
  "cierre",
  "simbolos",
  "aviso_avatar",
  "lineas_ayuda",
  "largo",
  "numeros",
  "copia_de_fuente",
  "nombra_autor",
  "etiqueta_desconocida",
  "muchas_etiquetas",
  "etiqueta_en_texto",
  "largo_linkedin",
  "hashtags_linkedin",
] as const
export type Regla = (typeof REGLAS_DETERMINISTAS)[number]
/** Rules only Claude can judge; they warn and never block (design table "Revisión automática"). */
export const REGLAS_CLAUDE = [
  "diagnostico",
  "caso_particular",
  "lenguaje_explicito",
  "cifra_sin_verificar",
  "tema_de_riesgo",
] as const
export type ReglaClaude = (typeof REGLAS_CLAUDE)[number]

/** Words in a row copied from a quote that make a finding (spec: 8 or more). */
export const LARGO_DE_COPIA = 8
const MINIMO_LETRAS_DE_NOMBRE = 4
const MINIMO_LETRAS_DE_APELLIDO = 5
const MENSAJE_COPIA = "Esta frase repite palabra por palabra una de las fuentes. Dila con tus palabras."
const MENSAJE_AUTOR = "Aquí aparece el nombre de una fuente. En el reel no se nombran autores: dilo sin nombrarla."

/** Third-party quotes and author names of the piece's backing; empty when it has none. */
export interface Ajeno {
  citas: readonly string[]
  autores: readonly string[]
  /** The authors of type persona: their surname alone also gives them away. */
  personas: readonly string[]
}

interface Palabra {
  normal: string
  desde: number
  hasta: number
}

/** Letters and digits only, lowercase and without accents: "Está," and "esta" are the same word. */
function palabrasComparables(texto: string): Palabra[] {
  const palabras: Palabra[] = []
  for (const m of texto.matchAll(/[\p{L}\p{N}]+/gu)) {
    const desde = m.index
    if (desde === undefined) continue
    palabras.push({
      normal: m[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(),
      desde,
      hasta: desde + m[0].length,
    })
  }
  return palabras
}

const ventana = (palabras: readonly Palabra[], desde: number, largo: number) =>
  palabras
    .slice(desde, desde + largo)
    .map((p) => p.normal)
    .join(" ")

/** Each maximal run of `LARGO_DE_COPIA` or more words of `texto` whose every window appears in a quote, as written in `texto`. */
export function tramosCopiados(texto: string, citas: readonly string[]): string[] {
  const n = LARGO_DE_COPIA
  const claves = new Set<string>()
  for (const cita of citas) {
    const p = palabrasComparables(cita)
    for (let i = 0; i + n <= p.length; i++) claves.add(ventana(p, i, n))
  }
  if (claves.size === 0) return []
  const palabras = palabrasComparables(texto)
  const tramos: string[] = []
  let i = 0
  while (i + n <= palabras.length) {
    if (!claves.has(ventana(palabras, i, n))) {
      i++
      continue
    }
    let fin = i + n
    while (fin < palabras.length && claves.has(ventana(palabras, fin - n + 1, n))) fin++
    const primera = palabras[i]
    const ultima = palabras[fin - 1]
    if (primera && ultima) tramos.push(texto.slice(primera.desde, ultima.hasta))
    i = fin
  }
  return [...new Set(tramos)]
}

/** Author names of the backing that appear whole in `texto`, as written there. Short names are skipped: too many false hits. */
export function autoresNombrados(
  texto: string,
  autores: readonly string[],
  personas: readonly string[] = [],
): string[] {
  const palabras = palabrasComparables(texto)
  const encontrados: string[] = []
  const cubiertas = new Set<number>()
  for (const autor of autores) {
    const nombre = palabrasComparables(autor)
    if (nombre.length === 0) continue
    if (nombre.reduce((suma, p) => suma + p.normal.length, 0) < MINIMO_LETRAS_DE_NOMBRE) continue
    const buscado = nombre.map((p) => p.normal).join(" ")
    for (let i = 0; i + nombre.length <= palabras.length; i++) {
      if (ventana(palabras, i, nombre.length) !== buscado) continue
      const primera = palabras[i]
      const ultima = palabras[i + nombre.length - 1]
      if (!primera || !ultima) continue
      encontrados.push(texto.slice(primera.desde, ultima.hasta))
      for (let k = i; k < i + nombre.length; k++) cubiertas.add(k)
    }
  }
  for (const persona of personas) {
    const apellido = palabrasComparables(persona).at(-1)
    if (!apellido || apellido.normal.length < MINIMO_LETRAS_DE_APELLIDO) continue
    palabras.forEach((palabra, k) => {
      if (cubiertas.has(k) || palabra.normal !== apellido.normal) return
      encontrados.push(texto.slice(palabra.desde, palabra.hasta))
    })
  }
  return [...new Set(encontrados)]
}

export interface Hallazgo {
  regla: Regla | ReglaClaude
  tipo: "bloquea" | "advierte"
  mensaje: string
  frase?: string
  /** Where the finding lives when it is not the script or the caption: the screen shows it under that field. */
  campo?: "linkedin"
}

/** An alert of an idea in the bank (`**verificar dato:** ...`), one entry per type. */
export interface Alerta {
  tipo: string
  texto: string
}

export const CIERRE = "Soy Coni del Rosario."
export const AVISO_AVATAR = "Video hecho con mi avatar digital."
export const LINEAS_AYUDA =
  "Líneas de ayuda en Chile: Fono 1455 (violencia contra la mujer), *4141 (prevención del suicidio, gratis, 24 horas) y 133 (emergencias)."
export const TIPO_ALERTA_LINEAS_AYUDA = "líneas de ayuda"
/** The types of alert an idea can carry, spelled as the bank writes them. */
export const TIPOS_DE_ALERTA = ["verificar dato", TIPO_ALERTA_LINEAS_AYUDA, "no es terapia", "nota"] as const

export const MINIMO_PALABRAS = 75
export const MAXIMO_PALABRAS = 150
/** A script of 150 words fits in well under this; it bounds what can be sent to the model and the voice. */
export const MAXIMO_DEL_GUION = 2000
// The voice reads the script aloud: anything that is not speech goes in the caption. Tone marks are removed before
// this check (`sinEtiquetas`); any other bracket is still a symbol. `{`, `}` and `\` also reach the ASS subtitles,
// where they would be read as override codes.
const SIMBOLO = /[\p{Extended_Pictographic}#@*_~^=<>{}[\]\\|/%$&+]/u
const NUMERO = /\d+/

export function pideLineasDeAyuda(alertas: readonly Alerta[]): boolean {
  return alertas.some((alerta) => alerta.tipo === TIPO_ALERTA_LINEAS_AYUDA)
}

export function revisarGuion(entrada: {
  guion: string
  texto: string
  esAvatar: boolean
  requiereLineasAyuda: boolean
  ajeno: Ajeno
}): Hallazgo[] {
  const { guion, texto, esAvatar, requiereLineasAyuda, ajeno } = entrada
  // Every rule about what is said reads the spoken text: a tone mark is not a symbol, a word or part of a quote.
  const hablado = sinEtiquetas(guion)
  const hallazgos: Hallazgo[] = []

  if (!hablado.trim().endsWith(CIERRE)) {
    hallazgos.push({
      regla: "cierre",
      tipo: "bloquea",
      mensaje: `El guion tiene que terminar con «${CIERRE}»`,
    })
  }

  const simbolo = SIMBOLO.exec(hablado)
  if (simbolo) {
    hallazgos.push({
      regla: "simbolos",
      tipo: "bloquea",
      mensaje: "Sin emojis, hashtags ni símbolos en el guion: van solo en la publicación.",
      frase: simbolo[0],
    })
  }

  if (esAvatar && !texto.includes(AVISO_AVATAR)) {
    hallazgos.push({
      regla: "aviso_avatar",
      tipo: "bloquea",
      mensaje: `El texto de la publicación tiene que avisar que es un avatar digital: «${AVISO_AVATAR}»`,
    })
  }

  if (requiereLineasAyuda && !["1455", "*4141", "133"].every((linea) => texto.includes(linea))) {
    hallazgos.push({
      regla: "lineas_ayuda",
      tipo: "bloquea",
      mensaje: "Este tema pide las líneas de ayuda de Chile en el texto de la publicación: 1455, *4141 y 133.",
    })
  }

  const cantidad = palabras(hablado).length
  if (cantidad < MINIMO_PALABRAS || cantidad > MAXIMO_PALABRAS) {
    hallazgos.push({
      regla: "largo",
      tipo: "advierte",
      mensaje: `El guion tiene ${cantidad} palabras. Lo ideal es entre ${MINIMO_PALABRAS} y ${MAXIMO_PALABRAS}.`,
    })
  }

  const numero = NUMERO.exec(hablado)
  if (numero) {
    hallazgos.push({
      regla: "numeros",
      tipo: "advierte",
      mensaje: "Escribe los números con palabras (tres señales, no 3 señales).",
      frase: numero[0],
    })
  }

  const marcas = etiquetasDe(guion)
  for (const frase of new Set(marcas.filter((marca) => !marca.conocida).map((marca) => marca.escrita))) {
    hallazgos.push({
      regla: "etiqueta_desconocida",
      tipo: "advierte",
      mensaje: `Esta marca de tono no la conozco: ${frase}. Usa una de la lista o bórrala.`,
      frase,
    })
  }
  if (marcas.length > MAXIMO_DE_ETIQUETAS) {
    hallazgos.push({
      regla: "muchas_etiquetas",
      tipo: "advierte",
      mensaje: `El guion tiene ${marcas.length} marcas de tono. Con ${MINIMO_DE_ETIQUETAS} a ${MAXIMO_DE_ETIQUETAS} la voz suena natural; con más suena actuada.`,
    })
  }
  // The caption is published as written: a known mark there would reach Instagram. Any other bracket keeps meaning
  // what it always did in a caption (nothing), so only the closed list blocks.
  for (const frase of new Set(
    etiquetasDe(texto)
      .filter((marca) => marca.conocida)
      .map((marca) => marca.escrita),
  )) {
    hallazgos.push({
      regla: "etiqueta_en_texto",
      tipo: "bloquea",
      mensaje: "Las marcas de tono van solo en el guion. Bórrala del texto de la publicación.",
      frase,
    })
  }

  // One finding per phrase even when the script and the caption share it: the screen keys and ticks findings by
  // rule, phrase and message, so two equal findings would be one checkbox for two warnings.
  const campos = [hablado, texto]
  for (const frase of new Set(campos.flatMap((campo) => tramosCopiados(campo, ajeno.citas)))) {
    hallazgos.push({ regla: "copia_de_fuente", tipo: "advierte", mensaje: MENSAJE_COPIA, frase })
  }
  for (const frase of new Set(campos.flatMap((campo) => autoresNombrados(campo, ajeno.autores, ajeno.personas)))) {
    hallazgos.push({ regla: "nombra_autor", tipo: "advierte", mensaje: MENSAJE_AUTOR, frase })
  }

  return hallazgos
}

/** LinkedIn takes 3000 characters per post. */
export const MAXIMO_TEXTO_LINKEDIN = 3000
export const MAXIMO_HASHTAGS_LINKEDIN = 3
// A hashtag starts a word: a number sign inside a word or standing alone is not one.
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu

/**
 * The LinkedIn text is published as written, like the caption: the same blocking rules (avatar notice, help lines,
 * tone marks) and warnings (copied phrases, named authors), plus LinkedIn's own limits. More hashtags than LinkedIn
 * recommends only warns. Every finding carries `campo: "linkedin"` so the screen shows it under that field.
 */
export function revisarTextoLinkedin(entrada: {
  texto: string
  esAvatar: boolean
  requiereLineasAyuda: boolean
  ajeno: Ajeno
}): Hallazgo[] {
  const { texto, esAvatar, requiereLineasAyuda, ajeno } = entrada
  const hallazgos: Hallazgo[] = []

  if (esAvatar && !texto.includes(AVISO_AVATAR)) {
    hallazgos.push({
      regla: "aviso_avatar",
      tipo: "bloquea",
      mensaje: `El texto para LinkedIn tiene que avisar que es un avatar digital: «${AVISO_AVATAR}»`,
    })
  }

  if (requiereLineasAyuda && !["1455", "*4141", "133"].every((linea) => texto.includes(linea))) {
    hallazgos.push({
      regla: "lineas_ayuda",
      tipo: "bloquea",
      mensaje: "Este tema pide las líneas de ayuda de Chile también en el texto para LinkedIn: 1455, *4141 y 133.",
    })
  }

  if ([...texto].length > MAXIMO_TEXTO_LINKEDIN) {
    hallazgos.push({
      regla: "largo_linkedin",
      tipo: "bloquea",
      mensaje: "LinkedIn acepta hasta 3.000 caracteres. Acorta un poco el texto.",
    })
  }

  const hashtags = texto.match(HASHTAG)?.length ?? 0
  if (hashtags > MAXIMO_HASHTAGS_LINKEDIN) {
    hallazgos.push({
      regla: "hashtags_linkedin",
      tipo: "advierte",
      mensaje: `En LinkedIn van como máximo ${MAXIMO_HASHTAGS_LINKEDIN} hashtags. Tiene ${hashtags}.`,
    })
  }

  for (const frase of new Set(
    etiquetasDe(texto)
      .filter((marca) => marca.conocida)
      .map((marca) => marca.escrita),
  )) {
    hallazgos.push({
      regla: "etiqueta_en_texto",
      tipo: "bloquea",
      mensaje: "Las marcas de tono van solo en el guion. Bórrala del texto para LinkedIn.",
      frase,
    })
  }

  for (const frase of new Set(tramosCopiados(texto, ajeno.citas))) {
    hallazgos.push({ regla: "copia_de_fuente", tipo: "advierte", mensaje: MENSAJE_COPIA, frase })
  }
  for (const frase of new Set(autoresNombrados(texto, ajeno.autores, ajeno.personas))) {
    hallazgos.push({ regla: "nombra_autor", tipo: "advierte", mensaje: MENSAJE_AUTOR, frase })
  }

  return hallazgos.map((hallazgo) => ({ ...hallazgo, campo: "linkedin" as const }))
}

export function bloquea(hallazgos: readonly Hallazgo[]): boolean {
  return hallazgos.some((hallazgo) => hallazgo.tipo === "bloquea")
}

/** An alert type as the bank writes it («verificar dato») shown as a sentence-case label. */
export function etiquetaDeAlerta(tipo: string): string {
  return tipo.charAt(0).toUpperCase() + tipo.slice(1)
}
