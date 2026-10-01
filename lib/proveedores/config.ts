import { z } from "zod"
import { valorDefinido } from "@/lib/dominio/estimaciones"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { ConfigProduccion } from "@/lib/proveedores/heygen"

const MODELO_ELEVEN_POR_DEFECTO = "eleven_multilingual_v2"
const FORMATO_POR_DEFECTO = "mp3_44100_128"

// coni.config.json documents itself with `_nota`-style keys; they must not trip the strict objects.
function sinNotas(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sinNotas)
  if (typeof valor !== "object" || valor === null) return valor
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([clave]) => !clave.startsWith("_"))
      .map(([clave, hijo]) => [clave, sinNotas(hijo)]),
  )
}

// "PENDIENTE", an empty string and a missing key all mean "not configured yet".
const id = z
  .string()
  .nullish()
  .transform((valor) => valorDefinido(valor?.trim()))
const textoOpcional = z
  .string()
  .nullish()
  .transform((valor) => valor || null)
const textoConDefecto = (defecto: string) =>
  z
    .string()
    .nullish()
    .transform((valor) => valor || defecto)

// Keys of the real coni.config.json that the course tooling reads (burned subtitles, Metricool) and this code does
// not use yet. They are listed so the strict objects accept the real file, and dropped so nothing here depends on a
// value that nothing here validates.
const delOtroLector = z
  .unknown()
  .transform(() => undefined)
  .optional()

const ajustesElevenlabs = z.strictObject({
  model: z.string().optional(),
  stability: z.number().optional(),
  similarity_boost: z.number().optional(),
  style: z.number().optional(),
  use_speaker_boost: z.boolean().optional(),
})

const vozDeElevenlabs = z.strictObject({
  stability: z.number().optional(),
  similarity_boost: z.number().optional(),
  style: z.number().optional(),
  use_speaker_boost: z.boolean().optional(),
  speed: z.number().optional(),
})

const esquemaElevenlabs = z.strictObject({
  voice_id: id,
  model_id: textoConDefecto(MODELO_ELEVEN_POR_DEFECTO),
  voice_settings: vozDeElevenlabs.optional(),
  output_format: textoConDefecto(FORMATO_POR_DEFECTO),
})

const esquema = z.strictObject({
  ruta_voz: z.enum(["heygen", "elevenlabs"]),
  heygen: z.strictObject({
    avatar_id: id,
    voice_id: id,
    ajustes_elevenlabs: ajustesElevenlabs.nullish().transform((valor) => valor ?? null),
    velocidad: z
      .number()
      .nullish()
      .transform((valor) => valor ?? null),
    aspect_ratio: textoOpcional,
    resolution: textoOpcional,
    subtitulos_quemados: delOtroLector,
    motor: z
      .enum(["avatar_iv", "avatar_v"])
      .nullish()
      .transform((valor) => valor ?? null),
    referencia_movimiento: id,
  }),
  metricool: delOtroLector,
  // A missing section behaves like an empty one: every default applies and the voice stays unconfigured.
  elevenlabs: esquemaElevenlabs.default({
    voice_id: null,
    model_id: MODELO_ELEVEN_POR_DEFECTO,
    output_format: FORMATO_POR_DEFECTO,
  }),
})

export type ConfigElevenlabs = z.output<typeof esquemaElevenlabs>
export type ConfigCompleta = ConfigProduccion & { elevenlabs: ConfigElevenlabs }

function rutaDelProblema(problema: z.core.$ZodIssue): string[] {
  const ruta = problema.path.map(String)
  // An unknown key is reported on its object; name it too so the message says what to remove.
  if (problema.code === "unrecognized_keys") {
    return problema.keys.map((clave) => [...ruta, clave].join("."))
  }
  return [ruta.join(".") || "(raíz)"]
}

/**
 * The production config of `ajustes.produccion` (same shape as coni.config.json), checked once at the boundary.
 * Failures are for WAV: the message lists the invalid paths and never the values, which may be keys by mistake.
 */
export function leerConfigProduccion(valor: unknown): ConfigCompleta {
  const resultado = esquema.safeParse(sinNotas(valor))
  if (!resultado.success) {
    const rutas = [...new Set(resultado.error.issues.flatMap(rutaDelProblema))]
    throw new FallaDeConfiguracion(`La configuración de producción no es válida en: ${rutas.join(", ")}.`)
  }
  return resultado.data
}
