import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"

export type ModeloClaude = "claude-opus-5-5" | "claude-sonnet-5-5"

interface ConfigDeTarea {
  modelo: ModeloClaude
  effort: "low" | "medium"
  // Sonnet 5.5 answers 400 to `disabled`: `between_tools` is its off switch. Opus 5.5 gets no thinking field at all.
  thinking?: { type: "between_tools" }
}

/** Single source of truth: which model, effort and thinking each task uses. Cost and estimates read the model from here. */
export const MODELO_POR_TAREA = {
  escribirGuion: { modelo: "claude-opus-5-5", effort: "medium" },
  revisarConClaude: { modelo: "claude-opus-5-5", effort: "low" },
  // A carousel is written and judged like a script (design 2026-10-26, D3: the model scripts use today).
  escribirCarrusel: { modelo: "claude-opus-5-5", effort: "medium" },
  revisarCarrusel: { modelo: "claude-opus-5-5", effort: "low" },
  // One automatic shortening of the slides that do not fit (plan 2026-10-27, amendment 3): a small rewrite.
  acortarLaminas: { modelo: "claude-opus-5-5", effort: "low" },
  escribirFicha: { modelo: "claude-opus-5-5", effort: "low" },
  clasificarIdea: { modelo: "claude-sonnet-5-5", effort: "low" },
  clasificarEnPilares: { modelo: "claude-sonnet-5-5", effort: "low" },
  extraerAfirmaciones: { modelo: "claude-sonnet-5-5", effort: "low" },
  nombrarTemas: { modelo: "claude-sonnet-5-5", effort: "low" },
  escribirTeorias: { modelo: "claude-opus-5-5", effort: "medium" },
  confirmarFusiones: { modelo: "claude-sonnet-5-5", effort: "low" },
  leerTextoEnImagenes: { modelo: "claude-sonnet-5-5", effort: "low" },
} as const satisfies Record<string, ConfigDeTarea>

type Tarea = keyof typeof MODELO_POR_TAREA
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

/** The answer hit `max_tokens`: asking again with the same request cuts it at the same place. */
export class RespuestaCortada extends Falla {
  constructor() {
    super("Claude se quedó sin espacio antes de terminar la respuesta.")
    this.name = "RespuestaCortada"
  }
}

// List prices, USD per million tokens. A cache write costs 1.25x the input price.
const PRECIOS: Record<ModeloClaude, { entrada: number; salida: number; lecturaCache: number }> = {
  "claude-opus-5-5": { entrada: 4, salida: 20, lecturaCache: 0.2 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10, lecturaCache: 0.2 },
}
const FACTOR_ESCRITURA_CACHE = 1.25

/** The model whose prices apply to a response. One this file does not price bills as the dearest it knows. */
export function modeloQueCobra(servido: string): ModeloClaude {
  return servido === "claude-opus-5-5" || servido === "claude-sonnet-5-5" ? servido : "claude-opus-5-5"
}

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
export function costoClaude(uso: UsoClaude, modelo: ModeloClaude): number {
  const precio = PRECIOS[modelo]
  const escritura = uso.cache_creation_input_tokens ?? 0
  const lectura = uso.cache_read_input_tokens ?? 0
  return (
    (uso.input_tokens * precio.entrada +
      uso.output_tokens * precio.salida +
      lectura * precio.lecturaCache +
      escritura * precio.entrada * FACTOR_ESCRITURA_CACHE) /
    1_000_000
  )
}

// Only the stable guide goes here, so every call of every piece reads the same cached prefix.
function sistemaCon(guia: string) {
  return [{ type: "text" as const, text: guia, cache_control: { type: "ephemeral" as const } }]
}

/** Typed SDK errors only: a key or request the API rejects will not change on retry, anything else will. */
function traducirError(error: unknown, modelo: ModeloClaude): unknown {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new FallaDeConfiguracion(`Anthropic rechazó la llave o no le da permiso (HTTP ${error.status}).`)
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new FallaDeConfiguracion(
      `Anthropic no encontró el modelo ${modelo} para esta cuenta (HTTP ${error.status}).`,
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
export async function pedirJson<S extends z.ZodType>(
  cliente: Anthropic,
  tarea: Tarea,
  pedido: {
    guia: string
    usuario: string | Anthropic.Beta.Messages.BetaContentBlockParam[]
    esquema: S
    /** False for a guide below the 1024-token cache minimum, where the marker buys nothing. */
    cachearGuia?: boolean
  },
): Promise<{ salida: z.infer<S>; uso: UsoClaude; modelo: string }> {
  const formato = betaZodOutputFormat(pedido.esquema)
  const config: ConfigDeTarea = MODELO_POR_TAREA[tarea]
  let respuesta: Anthropic.Beta.Messages.BetaMessage
  try {
    respuesta = await cliente.beta.messages.create({
      model: config.modelo,
      max_tokens: MAX_TOKENS,
      betas: [BETA_FALLBACK],
      fallbacks: "default",
      system: pedido.cachearGuia === false ? [{ type: "text", text: pedido.guia }] : sistemaCon(pedido.guia),
      messages: [{ role: "user", content: pedido.usuario }],
      output_config: { effort: config.effort, format: formato },
      ...(config.thinking ? { thinking: config.thinking } : {}),
    })
  } catch (error) {
    throw traducirError(error, config.modelo)
  }
  if (respuesta.stop_reason === "refusal") {
    throw new RechazoDeClaude()
  }
  if (respuesta.stop_reason === "max_tokens") {
    throw new RespuestaCortada()
  }
  // After a fallback, `content` holds what the declined model wrote (possibly half a JSON), a `fallback` block, and
  // then the answer of the model that served the request: only the last part is the answer.
  const respuestaFinal = respuesta.content.slice(respuesta.content.findLastIndex((b) => b.type === "fallback") + 1)
  const bloque = respuestaFinal.find((candidato) => candidato.type === "text")
  if (!bloque) {
    throw new Error("Claude no devolvió una respuesta que se pueda leer.")
  }
  let crudo: unknown
  try {
    crudo = JSON.parse(bloque.text)
  } catch (error) {
    throw new Error("Claude devolvió una respuesta que no tiene el formato pedido.", { cause: error })
  }
  const lectura = pedido.esquema.safeParse(crudo)
  if (!lectura.success) {
    throw new Error("Claude devolvió una respuesta que no tiene el formato pedido.", {
      cause: new Error(describirIncumplimientos(lectura.error.issues, crudo)),
    })
  }
  return { salida: lectura.data, uso: respuesta.usage, modelo: respuesta.model }
}

const MAXIMO_INCUMPLIMIENTOS_EN_LOG = 10
const MAXIMO_CARACTERES_DE_VALOR_EN_LOG = 60

/** Zod's message drops the value that failed; Trigger's logs need it. Truncated, and only the failing values. */
function describirIncumplimientos(issues: readonly z.core.$ZodIssue[], crudo: unknown): string {
  const lineas = issues.slice(0, MAXIMO_INCUMPLIMIENTOS_EN_LOG).map((issue) => {
    const valor = issue.path.reduce<unknown>(
      (actual, clave) => (typeof actual === "object" && actual !== null ? Reflect.get(actual, clave) : undefined),
      crudo,
    )
    const visto = (JSON.stringify(valor) ?? "undefined").slice(0, MAXIMO_CARACTERES_DE_VALOR_EN_LOG)
    return `${issue.path.join(".")}: ${issue.code}, valor recibido ${visto}`
  })
  const restantes = issues.length - lineas.length
  return [...lineas, ...(restantes > 0 ? [`y ${restantes} más`] : [])].join("; ")
}

function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

/**
 * The SDK moves `enum` out of the JSON schema into the field's description (structured outputs do not enforce it), so
 * the model can answer "clínica" for "clinica". The enum stays strict in the schema we send and in what we accept;
 * this only cleans the value first: trim, lowercase, no accents, then the synonyms. A value that is still unknown
 * becomes `porDefecto` and is reported to `alCorregir`; without `porDefecto` it stays as is and fails validation.
 */
export function enumTolerante<const V extends readonly [string, ...string[]]>(
  valores: V,
  opciones: {
    sinonimos?: Record<string, V[number]>
    porDefecto?: V[number]
    alCorregir?: (crudo: string) => void
  } = {},
) {
  const { sinonimos = {}, porDefecto, alCorregir } = opciones
  return z.preprocess((valor) => {
    if (typeof valor !== "string") return valor
    const limpio = sinAcentos(valor.trim().toLowerCase())
    const exacto = valores.find((candidato) => candidato === limpio)
    if (exacto !== undefined) return exacto
    const sinonimo = sinonimos[limpio]
    if (sinonimo !== undefined) return sinonimo
    if (porDefecto === undefined) return valor
    alCorregir?.(valor.slice(0, MAXIMO_CARACTERES_DE_VALOR_EN_LOG))
    return porDefecto
  }, z.enum(valores))
}

export function sumarUso(a: UsoClaude, b: UsoClaude): UsoClaude {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  }
}

/** Names are shown to Coni and the guides ban em dashes: whatever Claude writes, none gets through. */
export function sinRaya(texto: string): string {
  return texto.replace(/\s*[—–]\s*/g, ", ").trim()
}
