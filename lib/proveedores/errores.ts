// coni.py truncates ElevenLabs errors the same way: a gateway HTML page must not flood a notice.
const LARGO_MAXIMO = 400

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

/**
 * Readable reason from a HeyGen error body: `{"error": {"code", "message", ...}}` from the v3 API, plus
 * `hint` from the CLI. Same rules as coni.py, but never empty and never longer than 400 characters.
 */
export function mensajeErrorHeygen(cuerpo: string): string {
  const texto = cuerpo.trim()
  const crudo = texto.slice(0, LARGO_MAXIMO) || "sin detalle"
  let datos: unknown
  try {
    datos = JSON.parse(texto)
  } catch {
    // Not JSON (a proxy page, a plain-text error): the raw text is the best explanation we have.
    return crudo
  }
  const error = esRegistro(datos) ? datos.error : undefined
  if (!esRegistro(error)) {
    return crudo
  }
  const partes = [error.message, error.hint]
    .filter((parte): parte is string => typeof parte === "string" && parte.trim() !== "")
    .map((parte) => parte.trim())
  return (partes.join(" · ") || "sin detalle").slice(0, LARGO_MAXIMO)
}
