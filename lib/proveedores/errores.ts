/** Readable reason from a HeyGen error body `{"error": {"message", "hint"}}`; same rules as coni.py. */
export function mensajeErrorHeygen(cuerpo: string): string {
  let datos: unknown
  try {
    datos = JSON.parse(cuerpo)
  } catch {
    // Not JSON (a proxy page, a plain-text error): the raw text is the best explanation we have.
    return cuerpo || "sin detalle"
  }
  const error = typeof datos === "object" && datos !== null ? (datos as { error?: unknown }).error : undefined
  if (typeof error !== "object" || error === null) {
    return cuerpo || "sin detalle"
  }
  const { message, hint } = error as { message?: unknown; hint?: unknown }
  return [message, hint].filter((parte): parte is string => typeof parte === "string" && parte !== "").join(" · ")
}
