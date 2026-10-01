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

/** Machine-readable `error.code` of a HeyGen v3 error body (`content_policy_violation`, `unauthorized`, ...), if any. */
export function codigoErrorHeygen(cuerpo: string): string | null {
  let datos: unknown
  try {
    datos = JSON.parse(cuerpo)
  } catch {
    // Not JSON (a proxy page, a plain-text error): there is no code to read.
    return null
  }
  const error = esRegistro(datos) ? datos.error : undefined
  return esRegistro(error) && typeof error.code === "string" ? error.code : null
}

/**
 * Readable reason from an ElevenLabs error body: `{"detail": {"status", "message"}}` or `{"detail": "text"}`.
 * Port of `error_elevenlabs` in coni.py, but never empty and never longer than 400 characters.
 */
export function mensajeErrorElevenlabs(cuerpo: string): string {
  const texto = cuerpo.trim()
  const crudo = texto.slice(0, LARGO_MAXIMO) || "sin detalle"
  let datos: unknown
  try {
    datos = JSON.parse(texto)
  } catch {
    // Not JSON (a gateway page, plain text): the raw text is the best explanation we have.
    return crudo
  }
  const detalle = esRegistro(datos) ? datos.detail : undefined
  if (typeof detalle === "string") {
    return detalle.trim().slice(0, LARGO_MAXIMO) || "sin detalle"
  }
  if (esRegistro(detalle)) {
    const partes = [detalle.status, detalle.message]
      .filter((parte): parte is string => typeof parte === "string" && parte.trim() !== "")
      .map((parte) => parte.trim())
    return (partes.join(" · ") || crudo).slice(0, LARGO_MAXIMO)
  }
  return crudo
}
