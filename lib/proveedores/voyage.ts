import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

const URL_VOYAGE = "https://api.voyageai.com/v1/embeddings"
const ESPERA_MS = 60_000

export const MODELO_VOYAGE = "voyage-3.5"
export const DIMENSIONES = 1024
// voyage-3.5 list price in USD per million tokens. Must be checked against the account's plan before trusting the estimate.
const USD_POR_MILLON_DE_TOKENS = 0.06

const Respuesta = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()), index: z.number() })),
  usage: z.object({ total_tokens: z.number() }),
})

function sinLlave(texto: string, clave: string): string {
  return clave ? texto.split(clave).join("[llave]") : texto
}

/** 4xx other than "too early" and "too many requests" will not change by retrying: they are for WAV. */
function esErrorDeConfiguracion(estado: number): boolean {
  return estado >= 400 && estado < 500 && estado !== 408 && estado !== 429
}

/** Cost in USD of embedding `tokens` tokens. */
export function costoVoyage(tokens: number): number {
  return (tokens / 1_000_000) * USD_POR_MILLON_DE_TOKENS
}

/** Embeds `textos` with Voyage. Cards are `document`; a search text is a `query`. */
export async function embeber(entrada: {
  clave: string
  textos: string[]
  tipo: "document" | "query"
}): Promise<{ vectores: number[][]; tokens: number }> {
  const { clave, textos, tipo } = entrada
  let respuesta: Response
  try {
    respuesta = await fetch(URL_VOYAGE, {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: textos, model: MODELO_VOYAGE, input_type: tipo }),
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch (error) {
    // Network drops and timeouts are plain errors on purpose: they can be retried. The cause is dropped because
    // it may carry the request headers.
    throw new Error("No pude conectar con Voyage.", { cause: error instanceof Error ? error.name : undefined })
  }
  if (!respuesta.ok) {
    const detalle = sinLlave(await respuesta.text(), clave).slice(0, 300)
    const mensaje = `Voyage respondió HTTP ${respuesta.status}: ${detalle || "sin detalle"}`
    throw esErrorDeConfiguracion(respuesta.status) ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
  }
  let datos: unknown
  try {
    datos = await respuesta.json()
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Voyage devolvió una respuesta ilegible.", { cause: error })
    throw error
  }
  const leido = Respuesta.safeParse(datos)
  if (!leido.success)
    throw new Error("Voyage devolvió una respuesta con un formato inesperado.", { cause: leido.error })
  const vectores = [...leido.data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
  if (vectores.length !== textos.length) {
    throw new Error(`Voyage devolvió ${vectores.length} vectores para ${textos.length} textos.`)
  }
  if (vectores.some((v) => v.length !== DIMENSIONES)) {
    throw new Error(`Voyage devolvió un vector que no tiene ${DIMENSIONES} dimensiones.`)
  }
  return { vectores, tokens: leido.data.usage.total_tokens }
}
