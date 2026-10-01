import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { ConfigElevenlabs } from "@/lib/proveedores/config"
import { mensajeErrorElevenlabs } from "@/lib/proveedores/errores"

const BASE_POR_DEFECTO = "https://api.elevenlabs.io"
// Same limits as coni.py: a voice can take minutes, a lookup should not.
const ESPERA_VOZ_MS = 300_000
const ESPERA_VERIFICACION_MS = 30_000

/** Still a plain Error for the retry policy; the class only lets `verificarVoz` tell "no connection" apart. */
class SinConexion extends Error {
  constructor(cause: unknown) {
    super("No pude conectar con ElevenLabs.", { cause })
    this.name = "SinConexion"
  }
}

function baseDe(base: string | undefined): string {
  return (base ?? (process.env.ELEVENLABS_BASE_URL || BASE_POR_DEFECTO)).replace(/\/+$/, "")
}

function sinLlave(texto: string, clave: string): string {
  return clave ? texto.split(clave).join("[llave]") : texto
}

/** 4xx other than "too early" and "too many requests" will not change by retrying: they are for WAV. */
function esErrorDeConfiguracion(estado: number): boolean {
  return estado >= 400 && estado < 500 && estado !== 408 && estado !== 429
}

async function motivoDelError(respuesta: Response, clave: string): Promise<string> {
  // Redacted before parsing and capping: a key cut in half by the 400-character cap would leak a prefix.
  return mensajeErrorElevenlabs(sinLlave(await respuesta.text(), clave))
}

async function pedir<T>(
  url: string,
  init: RequestInit,
  esperaMs: number,
  leer: (respuesta: Response) => Promise<T>,
): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(esperaMs) })
  } catch (error) {
    // Network drops and timeouts are plain errors on purpose: Trigger.dev retries them.
    throw new SinConexion(error)
  }
  return leer(respuesta)
}

/** Speaks `texto` with Coni's cloned voice and returns the MP3 bytes. Same request as `cmd_voz` in coni.py. */
export async function generarVoz(entrada: {
  clave: string
  config: ConfigElevenlabs
  texto: string
  base?: string
}): Promise<Uint8Array> {
  const { clave, config, texto } = entrada
  if (!config.voice_id) {
    throw new FallaDeConfiguracion("Falta elevenlabs.voice_id en la configuración.")
  }
  const cuerpo: Record<string, unknown> = { text: texto, model_id: config.model_id }
  if (config.voice_settings && Object.keys(config.voice_settings).length > 0) {
    cuerpo.voice_settings = config.voice_settings
  }
  const url = `${baseDe(entrada.base)}/v1/text-to-speech/${encodeURIComponent(config.voice_id)}?output_format=${encodeURIComponent(config.output_format)}`

  return pedir(
    url,
    {
      method: "POST",
      headers: { "xi-api-key": clave, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(cuerpo),
    },
    ESPERA_VOZ_MS,
    async (respuesta) => {
      if (!respuesta.ok) {
        const mensaje = `ElevenLabs respondió HTTP ${respuesta.status}: ${await motivoDelError(respuesta, clave)}`
        throw esErrorDeConfiguracion(respuesta.status) ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
      }
      const audio = new Uint8Array(await respuesta.arrayBuffer())
      if (audio.length === 0) {
        throw new Error("ElevenLabs devolvió un audio vacío.")
      }
      return audio
    },
  )
}

export type ResultadoVerificacion = { ok: true; nombre: string } | { ok: false; motivo: string }

/** Looks the voice up the way `verificar` does in coni.py. A failure is a result, not an exception. */
export async function verificarVoz(entrada: {
  clave: string
  voiceId: string
  base?: string
}): Promise<ResultadoVerificacion> {
  const { clave, voiceId } = entrada
  try {
    return await pedir(
      `${baseDe(entrada.base)}/v1/voices/${encodeURIComponent(voiceId)}`,
      { method: "GET", headers: { "xi-api-key": clave } },
      ESPERA_VERIFICACION_MS,
      async (respuesta): Promise<ResultadoVerificacion> => {
        if (!respuesta.ok) {
          return {
            ok: false,
            motivo: `HTTP ${respuesta.status} · ${await motivoDelError(respuesta, clave)} · Revisa el voice_id y que la llave tenga permiso de lectura de Voices.`,
          }
        }
        let datos: unknown
        try {
          datos = await respuesta.json()
        } catch (error) {
          if (error instanceof SyntaxError) return { ok: false, motivo: "ElevenLabs devolvió una respuesta ilegible." }
          throw error
        }
        const nombre =
          typeof datos === "object" && datos !== null && "name" in datos && typeof datos.name === "string"
            ? datos.name
            : "(sin nombre)"
        return { ok: true, nombre }
      },
    )
  } catch (error) {
    if (error instanceof SinConexion) return { ok: false, motivo: error.message }
    throw error
  }
}
