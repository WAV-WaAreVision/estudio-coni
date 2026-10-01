import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { type Alerta, AVISO_AVATAR, CIERRE, type Hallazgo, LINEAS_AYUDA, REGLAS_CLAUDE } from "@/lib/dominio/revision"

export const MODELO = "claude-opus-5-5"
// Routes a declined request to the fallback Anthropic recommends for that refusal category.
const BETA_FALLBACK = "server-side-fallback-2026-07-01"
const MAX_TOKENS = 16_000

/** Claude declined, even after the fallback. A Falla so Coni reads it; its own class so callers can tell it from other Fallas. */
export class RechazoDeClaude extends Falla {
  constructor() {
    super("Claude no quiso escribir este guion. Prueba con otra idea.")
    this.name = "RechazoDeClaude"
  }
}

// Opus 5.5 list prices, USD per million tokens. A cache write costs 1.25x the input price.
const USD_ENTRADA = 4
const USD_SALIDA = 20
const USD_LECTURA_CACHE = 0.2
const USD_ESCRITURA_CACHE = USD_ENTRADA * 1.25

export interface UsoClaude {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/**
 * Cost in USD of one response. If a fallback model served it, that model bills at its own rates and the real
 * cost can be higher; the reservation's estimate leaves room for that.
 */
export function costoClaude(uso: UsoClaude): number {
  const escritura = uso.cache_creation_input_tokens ?? 0
  const lectura = uso.cache_read_input_tokens ?? 0
  return (
    (uso.input_tokens * USD_ENTRADA +
      uso.output_tokens * USD_SALIDA +
      lectura * USD_LECTURA_CACHE +
      escritura * USD_ESCRITURA_CACHE) /
    1_000_000
  )
}

/** The idea as the prompt needs it: the fields of the bank and its alerts, which are passed verbatim. */
export interface IdeaParaGuion {
  pilar: string
  gancho: string
  tema: string
  formato: string
  alertas: readonly Alerta[]
}

const SalidaGuion = z.object({ guion: z.string(), texto: z.string() })
const SalidaRevision = z.object({
  hallazgos: z.array(z.object({ regla: z.enum(REGLAS_CLAUDE), frase: z.string(), mensaje: z.string() })),
})

// Only the stable guide goes here, so every call of every piece reads the same cached prefix.
function sistemaCon(guia: string) {
  return [{ type: "text" as const, text: guia, cache_control: { type: "ephemeral" as const } }]
}

function listaDeAlertas(alertas: readonly Alerta[]): string {
  return alertas.length > 0
    ? alertas.map((alerta) => `- ${alerta.tipo}: ${alerta.texto}`).join("\n")
    : "Esta idea no trae alertas."
}

function describirHallazgo(hallazgo: Hallazgo): string {
  return hallazgo.frase ? `- ${hallazgo.mensaje} (frase: «${hallazgo.frase}»)` : `- ${hallazgo.mensaje}`
}

function pedidoDeGuion(idea: IdeaParaGuion, requiereLineasAyuda: boolean, correcciones: readonly Hallazgo[]): string {
  const partes = [
    "Escribe el guion y el texto de publicación de un reel de Coni del Rosario a partir de esta idea. Sigue la línea editorial de tus instrucciones.",
    `IDEA
Pilar: ${idea.pilar}
Gancho: ${idea.gancho}
Tema: ${idea.tema}
Formato: ${idea.formato}`,
    `ALERTAS DE LA IDEA (respétalas tal cual)
${listaDeAlertas(idea.alertas)}`,
    `REGLAS DEL GUION
- Entre 75 y 150 palabras.
- La última línea es exactamente: ${CIERRE}
- Escribe todos los números con palabras.
- Sin emojis, hashtags ni símbolos. Usa solo letras, la puntuación del español y saltos de línea; nada de # @ * _ ~ ^ = < > { } [ ] \\ | / % $ & +.
- Sin diagnósticos, sin consejos para casos particulares, sin anécdotas de pacientes y sin cifras ni estudios que la idea no traiga ya verificados.`,
    `REGLAS DEL TEXTO DE PUBLICACIÓN
- Es el texto que acompaña el video en Instagram. Aquí sí pueden ir emojis y hashtags.
- Termina exactamente con: ${AVISO_AVATAR}${
      requiereLineasAyuda ? `\n- Antes de ese aviso incluye, tal cual, esta línea: ${LINEAS_AYUDA}` : ""
    }`,
  ]
  if (correcciones.length > 0) {
    partes.push(`CORRECCIONES
Tu versión anterior no pasó la revisión. Escribe de nuevo el guion y el texto completos, arreglando esto:
${correcciones.map(describirHallazgo).join("\n")}`)
  }
  return partes.join("\n\n")
}

function pedidoDeRevision(entrada: { guion: string; texto: string; alertas: readonly Alerta[] }): string {
  return `Revisa el guion y el texto de publicación de un reel de Coni del Rosario. Marca solo lo que de verdad esté ahí; si no hay nada, devuelve la lista vacía.

REGLAS (usa exactamente estos nombres)
- diagnostico: diagnostica o etiqueta a alguien, por ejemplo «tienes ansiedad» o «tu pareja es narcisista».
- caso_particular: da un consejo para un caso particular en vez de educación general.
- lenguaje_explicito: usa lenguaje sexual explícito en vez del lenguaje clínico y cotidiano de la línea editorial.
- cifra_sin_verificar: trae cifras, porcentajes, estudios o afirmaciones científicas que la idea no trae verificados. Si la idea tiene una alerta «verificar dato», sé estricta.
- tema_de_riesgo: el tema toca violencia, abuso, suicidio o autolesiones, aunque la idea no lo marque.

Cada hallazgo lleva la regla, la frase (una cita textual corta del guion o del texto) y un mensaje de una oración para Coni, en español de Chile, sin rayas largas.

ALERTAS DE LA IDEA
${listaDeAlertas(entrada.alertas)}

<guion>
${entrada.guion}
</guion>

<texto_de_publicacion>
${entrada.texto}
</texto_de_publicacion>`
}

/** Typed SDK errors only: a key or request the API rejects will not change on retry, anything else will. */
function traducirError(error: unknown): unknown {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new FallaDeConfiguracion(`Anthropic rechazó la llave o no le da permiso (HTTP ${error.status}).`)
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new FallaDeConfiguracion(
      `Anthropic no encontró el modelo ${MODELO} para esta cuenta (HTTP ${error.status}).`,
    )
  }
  if (error instanceof Anthropic.APIError && esRechazoDelPedido(error.status)) {
    return new FallaDeConfiguracion(`Anthropic rechazó el pedido (HTTP ${error.status}): ${error.message}`)
  }
  // Rate limits, 5xx, overload and connection failures keep their SDK class: plain errors Trigger.dev retries.
  return error
}

function esRechazoDelPedido(estado: number | undefined): boolean {
  return estado !== undefined && estado >= 400 && estado < 500 && estado !== 408 && estado !== 409 && estado !== 429
}

/**
 * One structured call. It uses `create` and parses by hand because `parse` reads the answer before the caller can
 * look at `stop_reason`: a refusal that carries half a JSON would surface as a parsing error instead of a refusal.
 */
async function pedirJson<S extends z.ZodType>(
  cliente: Anthropic,
  pedido: { guia: string; usuario: string; effort: "low" | "medium"; esquema: S },
): Promise<{ salida: z.infer<S>; uso: UsoClaude }> {
  const formato = betaZodOutputFormat(pedido.esquema)
  let respuesta: Anthropic.Beta.Messages.BetaMessage
  try {
    respuesta = await cliente.beta.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      betas: [BETA_FALLBACK],
      fallbacks: "default",
      system: sistemaCon(pedido.guia),
      messages: [{ role: "user", content: pedido.usuario }],
      output_config: { effort: pedido.effort, format: formato },
    })
  } catch (error) {
    throw traducirError(error)
  }
  if (respuesta.stop_reason === "refusal") {
    throw new RechazoDeClaude()
  }
  if (respuesta.stop_reason === "max_tokens") {
    throw new Error("Claude se quedó sin espacio antes de terminar la respuesta.")
  }
  // After a fallback, `content` holds what the declined model wrote (possibly half a JSON), a `fallback` block, and
  // then the answer of the model that served the request: only the last part is the answer.
  const respuestaFinal = respuesta.content.slice(respuesta.content.findLastIndex((b) => b.type === "fallback") + 1)
  const bloque = respuestaFinal.find((candidato) => candidato.type === "text")
  if (!bloque) {
    throw new Error("Claude no devolvió una respuesta que se pueda leer.")
  }
  try {
    return { salida: formato.parse(bloque.text), uso: respuesta.usage }
  } catch (error) {
    throw new Error("Claude devolvió una respuesta que no tiene el formato pedido.", { cause: error })
  }
}

/** Writes the script and the caption of a reel. Only configuration errors are final; the rest is retried by the caller. */
export async function escribirGuion(entrada: {
  cliente: Anthropic
  guia: string
  idea: IdeaParaGuion
  requiereLineasAyuda: boolean
  correcciones?: readonly Hallazgo[]
}): Promise<{ guion: string; texto: string; uso: UsoClaude }> {
  const { cliente, guia, idea, requiereLineasAyuda, correcciones = [] } = entrada
  const { salida, uso } = await pedirJson(cliente, {
    guia,
    usuario: pedidoDeGuion(idea, requiereLineasAyuda, correcciones),
    effort: "medium",
    esquema: SalidaGuion,
  })
  return { guion: salida.guion, texto: salida.texto, uso }
}

/** The part of the review only Claude can do. Every finding warns; none blocks. */
export async function revisarConClaude(entrada: {
  cliente: Anthropic
  guia: string
  guion: string
  texto: string
  alertas: readonly Alerta[]
}): Promise<{ hallazgos: Hallazgo[]; uso: UsoClaude }> {
  const { cliente, guia, guion, texto, alertas } = entrada
  const { salida, uso } = await pedirJson(cliente, {
    guia,
    usuario: pedidoDeRevision({ guion, texto, alertas }),
    effort: "low",
    esquema: SalidaRevision,
  })
  const hallazgos = salida.hallazgos.map(
    (h): Hallazgo => ({ regla: h.regla, tipo: "advierte", mensaje: h.mensaje, frase: h.frase }),
  )
  return { hallazgos, uso }
}
