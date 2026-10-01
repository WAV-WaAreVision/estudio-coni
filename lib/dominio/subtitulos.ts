import { palabras, redondearPar } from "@/lib/dominio/estimaciones"
import { Falla } from "@/lib/dominio/falla"
import { compararSecuencias } from "@/lib/dominio/secuencias"

/** [start, end, phrase], times in seconds. */
export type Cue = readonly [inicio: number, fin: number, frase: string]

// Safe zone of a 1080x1920 Reel: Instagram covers the bottom ~20% and the right button column.
// The subtitle sits centred at 70% of the height, with 800 px of usable width.
export const ANCHO_REEL = 1080
export const ALTO_REEL = 1920
export const CENTRO_SUBTITULO = [540, 1344] as const
export const MARGEN_LATERAL_SUBTITULO = 140
// coni.py used Avenir Next, which only exists on macOS; the render container ships Montserrat.
export const FUENTE_SUBTITULO = "Montserrat"

// Python's str.splitlines() also breaks on \r, \v, \f, \x1c-\x1e, \x85 and the Unicode line separators.
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are the point, they mirror splitlines()
const SALTO_DE_LINEA = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/

function marcaIlegible(texto: string): Falla {
  return new Falla(`Los subtítulos de HeyGen traen una marca de tiempo ilegible: "${texto.trim()}".`)
}

function aSegundos(marca: string): number {
  const partes = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(marca.trim().replaceAll(",", "."))
  if (!partes) throw marcaIlegible(marca)
  const [, h, m, s] = partes
  const total = Number.parseInt(h, 10) * 3600 + Number.parseInt(m, 10) * 60 + Number.parseFloat(s)
  return Math.round(total * 1000) / 1000
}

export function leerSrt(texto: string): Cue[] {
  const cues: Cue[] = []
  const limpio = texto
    .replace(/^\uFEFF+/, "")
    .replaceAll("\r\n", "\n")
    .trim()
  for (const bloque of limpio.split(/\n\s*\n/)) {
    const lineas = bloque.split(SALTO_DE_LINEA)
    const i = lineas.findIndex((linea) => linea.includes("-->"))
    if (i === -1) continue
    const marcas = lineas[i].split("-->")
    if (marcas.length !== 2) throw marcaIlegible(lineas[i])
    const [inicio, fin] = marcas
    const frase = lineas
      .slice(i + 1)
      .map((linea) => linea.trim())
      .filter(Boolean)
      .join(" ")
    if (frase) cues.push([aSegundos(inicio), aSegundos(fin), frase])
  }
  return cues
}

// Python's re.sub(r"[^\w]", "", palabra.lower()): keep Unicode letters, digits and underscore.
function comparable(palabra: string): string {
  return palabra.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "")
}

/**
 * Phrases with the approved script's words and the SRT's timing. HeyGen transcribes the audio and
 * gets names wrong ("Connie" for "Coni"): each script word goes to the SRT phrase it aligns with,
 * and words HeyGen did not transcribe go to the neighbouring phrase.
 */
export function alinearConGuion(cues: readonly Cue[], guion: string): Cue[] {
  const delGuion = palabras(guion)
  if (delGuion.length === 0) throw new Falla("El guion está vacío.")
  const delSrt = cues.flatMap(([, , frase], n) => palabras(frase).map((palabra) => [n, palabra] as const))
  if (delSrt.length === 0) throw new Falla("HeyGen entregó subtítulos sin texto. Vuelve a bajarlos.")
  const { ratio, opcodes } = compararSecuencias(
    delGuion.map(comparable),
    delSrt.map(([, palabra]) => comparable(palabra)),
  )
  if (ratio < 0.8) {
    throw new Falla("Los subtítulos de HeyGen no calzan con el guion. ¿Cambió el guion después del render?")
  }

  const fraseDe: (number | null)[] = delGuion.map(() => null)
  for (const [op, g1, g2, s1, s2] of opcodes) {
    if (op !== "equal" && op !== "replace") continue
    for (let k = 0; k < g2 - g1; k++) {
      fraseDe[g1 + k] = delSrt[s1 + Math.floor((k * (s2 - s1)) / (g2 - g1))][0]
    }
  }
  for (let k = 1; k < fraseDe.length; k++) {
    fraseDe[k] ??= fraseDe[k - 1]
  }
  for (let k = fraseDe.length - 2; k >= 0; k--) {
    fraseDe[k] ??= fraseDe[k + 1]
  }

  const porFrase = new Map<number, string[]>()
  for (let k = 0; k < delGuion.length; k++) {
    const n = fraseDe[k]
    if (n === null) continue
    const lista = porFrase.get(n)
    if (lista) {
      lista.push(delGuion[k])
    } else {
      porFrase.set(n, [delGuion[k]])
    }
  }
  return cues.flatMap(([inicio, fin], n): Cue[] => {
    const lista = porFrase.get(n)
    return lista ? [[inicio, fin, lista.join(" ")]] : []
  })
}

export function marcaAss(segundos: number): string {
  const cs = redondearPar(segundos * 100)
  const dos = (x: number) => String(x).padStart(2, "0")
  return `${Math.floor(cs / 360000)}:${dos(Math.floor(cs / 6000) % 60)}:${dos(Math.floor(cs / 100) % 60)}.${dos(cs % 100)}`
}

// libass reads {..} as override tags and \N \n \h as breaks; the script is free text.
// Braces use libass' own escapes; a backslash gets a zero-width space so "\N" is drawn as text.
// Backslash first: escaping braces first would put the space inside the new "\{".
function escaparAss(frase: string): string {
  return frase.replaceAll("\\", "\\\u200B").replaceAll("{", "\\{").replaceAll("}", "\\}")
}

/** ASS subtitles for a Reel: bold white text with an outline, centred in the safe zone. */
export function assDe(cues: readonly Cue[]): string {
  const [x, y] = CENTRO_SUBTITULO
  const m = MARGEN_LATERAL_SUBTITULO
  const encabezado = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${ANCHO_REEL}`,
    `PlayResY: ${ALTO_REEL}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Coni,${FUENTE_SUBTITULO},84,&H00FFFFFF,&H00FFFFFF,&H14000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,0,5,${m},${m},0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ]
  const dialogos = cues.map(
    ([inicio, fin, frase]) =>
      `Dialogue: 0,${marcaAss(inicio)},${marcaAss(fin)},Coni,,0,0,0,,{\\an5\\pos(${x},${y})}${escaparAss(frase)}`,
  )
  return `${encabezado.join("\n")}\n${dialogos.join("\n")}\n`
}
