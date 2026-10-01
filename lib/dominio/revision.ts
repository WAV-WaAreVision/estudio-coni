import { palabras } from "@/lib/dominio/estimaciones"

export type Regla = "cierre" | "simbolos" | "aviso_avatar" | "lineas_ayuda" | "largo" | "numeros"
/** Rules only Claude can judge; they warn and never block (design table "Revisión automática"). */
export const REGLAS_CLAUDE = [
  "diagnostico",
  "caso_particular",
  "lenguaje_explicito",
  "cifra_sin_verificar",
  "tema_de_riesgo",
] as const
export type ReglaClaude = (typeof REGLAS_CLAUDE)[number]

export interface Hallazgo {
  regla: Regla | ReglaClaude
  tipo: "bloquea" | "advierte"
  mensaje: string
  frase?: string
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

const MINIMO_PALABRAS = 75
const MAXIMO_PALABRAS = 150
// The voice reads the script aloud: anything that is not speech goes in the caption. `{`, `}` and `\` also
// reach the ASS subtitles, where they would be read as override codes.
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
}): Hallazgo[] {
  const { guion, texto, esAvatar, requiereLineasAyuda } = entrada
  const hallazgos: Hallazgo[] = []

  if (!guion.trim().endsWith(CIERRE)) {
    hallazgos.push({
      regla: "cierre",
      tipo: "bloquea",
      mensaje: `El guion tiene que terminar con «${CIERRE}»`,
    })
  }

  const simbolo = SIMBOLO.exec(guion)
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

  const cantidad = palabras(guion).length
  if (cantidad < MINIMO_PALABRAS || cantidad > MAXIMO_PALABRAS) {
    hallazgos.push({
      regla: "largo",
      tipo: "advierte",
      mensaje: `El guion tiene ${cantidad} palabras. Lo ideal es entre ${MINIMO_PALABRAS} y ${MAXIMO_PALABRAS}.`,
    })
  }

  const numero = NUMERO.exec(guion)
  if (numero) {
    hallazgos.push({
      regla: "numeros",
      tipo: "advierte",
      mensaje: "Escribe los números con palabras (tres señales, no 3 señales).",
      frase: numero[0],
    })
  }

  return hallazgos
}

export function bloquea(hallazgos: readonly Hallazgo[]): boolean {
  return hallazgos.some((hallazgo) => hallazgo.tipo === "bloquea")
}
