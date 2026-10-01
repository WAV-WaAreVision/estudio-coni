import Anthropic from "@anthropic-ai/sdk"
import { baseDe } from "./bases"

/**
 * The result of asking a provider whether a key works. `rechazada` tells a key the provider refused (Coni has to
 * change it) from a check that could not run (the provider is down or unreachable: nothing to blame on the key).
 */
export type ResultadoDeVerificacion = { ok: true } | { ok: false; rechazada: boolean; detalle: string }

const ESPERA_MS = 10_000

function sinLlave(texto: string, clave: string): string {
  return clave ? texto.split(clave).join("[llave]") : texto
}

/**
 * `GET /v3/users/me` is the documented way to check a key ("You can verify your key is working by fetching your
 * account info"; an invalid key answers 401): https://developers.heygen.com/docs/api-key.md
 */
export async function verificarHeygen(entrada: { clave: string }): Promise<ResultadoDeVerificacion> {
  const base = baseDe(process.env, "HEYGEN_BASE_URL", "https://api.heygen.com")
  let respuesta: Response
  try {
    respuesta = await fetch(`${base}/v3/users/me`, {
      headers: { "X-Api-Key": entrada.clave },
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch {
    return { ok: false, rechazada: false, detalle: "No pude conectar con HeyGen." }
  }
  if (respuesta.ok) return { ok: true }
  const rechazada = respuesta.status === 401 || respuesta.status === 403
  const cuerpo = sinLlave((await respuesta.text()).slice(0, 200), entrada.clave)
  return { ok: false, rechazada, detalle: `HeyGen respondió HTTP ${respuesta.status}: ${cuerpo}` }
}

/** Lists one model: it needs the key and spends no tokens. */
export async function verificarAnthropic(entrada: { clave: string }): Promise<ResultadoDeVerificacion> {
  const cliente = new Anthropic({
    apiKey: entrada.clave,
    baseURL: baseDe(process.env, "ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
    maxRetries: 0,
    timeout: ESPERA_MS,
  })
  try {
    await cliente.models.list({ limit: 1 })
    return { ok: true }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, rechazada: true, detalle: `Anthropic respondió HTTP ${error.status}.` }
    }
    return { ok: false, rechazada: false, detalle: "No pude consultar a Anthropic." }
  }
}
