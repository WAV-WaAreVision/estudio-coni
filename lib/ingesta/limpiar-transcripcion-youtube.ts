const CIERRE_DE_TARJETA = /^(?:\.\.\.|…)\s*(?:más|more)$/i
// A card is a short title plus its description: never more than a handful of lines.
const MAXIMO_LINEAS_DE_TARJETA = 6

const UNIDAD = "(?:horas?|hours?|minutos?|minutes?|segundos?|seconds?)"
const DURACION = `\\d+\\s*${UNIDAD}(?:(?:\\s*,\\s*|\\s+y\\s+|\\s+and\\s+|\\s*,\\s*and\\s+)\\d+\\s*${UNIDAD})*`
// "Mostrar transcripción" glues the clock (M:SS or H:MM:SS) to its spoken form ("0:000 segundos").
const PREFIJO_PEGADO = new RegExp(`^\\d+(?::\\d{2}){1,2}${DURACION}`, "i")
const SOLO_RELOJ = /^\d+(?::\d{2}){1,2}$/
const ETIQUETA_DE_SONIDO = /\[[\p{L}\s♪-]{1,30}\]/gu

function sinTarjetas(lineas: string[]): string[] {
  const resultado = [...lineas]
  for (let i = resultado.length - 1; i >= 0; i--) {
    if (!CIERRE_DE_TARJETA.test((resultado[i] ?? "").trim())) continue
    let inicio = i
    while (inicio > 0 && (resultado[inicio - 1] ?? "").trim() !== "") inicio--
    const largo = i - inicio + 1
    const esTarjeta = inicio > 0 && largo >= 3 && largo <= MAXIMO_LINEAS_DE_TARJETA
    resultado.splice(esTarjeta ? inicio : i, esTarjeta ? largo : 1)
    i = Math.min(i, resultado.length)
  }
  return resultado
}

function sinMarcaDeTiempo(linea: string): string {
  const recortada = linea.trim()
  if (SOLO_RELOJ.test(recortada)) return ""
  return recortada.replace(PREFIJO_PEGADO, "")
}

/** Turns the text copied from YouTube's "Mostrar transcripción" into plain flowing speech. */
export function limpiarTranscripcionDeYoutube(texto: string): string {
  return sinTarjetas(texto.split(/\r?\n/))
    .map(sinMarcaDeTiempo)
    .join(" ")
    .replace(ETIQUETA_DE_SONIDO, " ")
    .replace(/\s+/g, " ")
    .trim()
}
