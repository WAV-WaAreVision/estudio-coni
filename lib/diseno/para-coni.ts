/**
 * Exit critique 3: Coni reads what happened in her words; the provider, the API balance and the keys are WAV's detail,
 * folded under "Detalle para WAV" with a link to the provider. Texts the app already writes for her stay as they are.
 */

/** What she reads when a provider's text says nothing she can act on. */
export const TEXTO_ALGO_FALLO = "Algo no salió como esperaba con esta pieza."

export interface Proveedor {
  nombre: string
  href: string
}

export interface ParaConi {
  /** What she reads. */
  texto: string
  /** What WAV reads, folded; empty when there is nothing technical to say. */
  detalle: string[]
  /** The provider the detail is about, for its link. */
  proveedor: Proveedor | null
}

const PROVEEDORES: readonly { patron: RegExp; proveedor: Proveedor }[] = [
  { patron: /\bHeyGen\b/i, proveedor: { nombre: "HeyGen", href: "https://app.heygen.com" } },
  { patron: /\bElevenLabs\b/i, proveedor: { nombre: "ElevenLabs", href: "https://elevenlabs.io/app" } },
  { patron: /\b(Anthropic|Claude)\b/i, proveedor: { nombre: "Anthropic", href: "https://console.anthropic.com" } },
]
const OPERACION = /\b(HeyGen|ElevenLabs|Anthropic|Claude|API|llave)\b/i

export function esDeOperacion(texto: string): boolean {
  return OPERACION.test(texto)
}

function proveedorDe(lineas: readonly string[]): Proveedor | null {
  for (const linea of lineas) for (const { patron, proveedor } of PROVEEDORES) if (patron.test(linea)) return proveedor
  return null
}

/**
 * `texto` as she reads it: kept when it is hers, replaced by `enSusPalabras` (what happened and what she can do) when
 * it speaks of a provider, and then moved to the detail. `extra` holds lines that are always WAV's (a balance).
 */
export function separarParaConi(texto: string, enSusPalabras: string, extra: readonly string[] = []): ParaConi {
  const tecnico = esDeOperacion(texto)
  const detalle = [...(tecnico ? [texto] : []), ...extra]
  return { texto: tecnico ? enSusPalabras : texto, detalle, proveedor: proveedorDe(detalle) }
}
