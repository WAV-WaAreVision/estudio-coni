import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import type { MotivoDePausa, ProveedorConPausa } from "@/lib/dominio/pausas"
import { PausaDeProveedor } from "@/lib/dominio/pausas"
import { traducirErrorDeClaude } from "@/lib/proveedores/anthropic"
import { embeber } from "@/lib/proveedores/voyage"

// Spec 2026-11-07, decision 5: one minimal question per open pause, every ten minutes. The doc of each call is cited
// in docs/superpowers/plans/2026-11-07-errores-de-proveedor-parte-1.md ("Provider checks verified against the docs").
const ESPERA_MS = 15_000
const MODELO_DEL_CHEQUEO = "claude-sonnet-5-5"

export type ResultadoDeChequeo = { ok: true } | { ok: false; motivo: string }

export interface EntradaDeChequeo {
  proveedor: ProveedorConPausa
  motivo: MotivoDePausa
  llave: string
  bases: { elevenlabs: string; heygen: string }
}

const no = (motivo: string): ResultadoDeChequeo => ({ ok: false, motivo })

/** Never puts the body in the reason: a provider may echo the key back. */
async function leerJson(
  url: string,
  cabeceras: Record<string, string>,
): Promise<{ ok: true; cuerpo: unknown } | { ok: false; motivo: string }> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(ESPERA_MS) })
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))
    ) {
      return { ok: false, motivo: "sin_conexion" }
    }
    throw error
  }
  if (!respuesta.ok) return { ok: false, motivo: `HTTP ${respuesta.status}` }
  try {
    return { ok: true, cuerpo: await respuesta.json() }
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, motivo: "ilegible" }
    throw error
  }
}

// https://elevenlabs.io/docs/api-reference/user/subscription/get
const Suscripcion = z.object({
  status: z.string(),
  character_count: z.number(),
  character_limit: z.number(),
  can_extend_character_limit: z.boolean().nullish(),
})
const ESTADOS_SIN_PAGO = new Set([
  "past_due",
  "incomplete",
  "free_disabled",
  "unpaid",
  "canceled",
  "incomplete_expired",
])

async function chequearElevenlabs(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  const r = await leerJson(`${entrada.bases.elevenlabs}/v1/user/subscription`, { "xi-api-key": entrada.llave })
  if (!r.ok) return r
  const leida = Suscripcion.safeParse(r.cuerpo)
  if (!leida.success) return no("formato")
  const s = leida.data
  if (ESTADOS_SIN_PAGO.has(s.status)) return no(`estado ${s.status}`)
  if (entrada.motivo === "cuota" && s.character_count >= s.character_limit && s.can_extend_character_limit !== true) {
    return no("sin caracteres")
  }
  return { ok: true }
}

// https://developers.heygen.com/reference/get-current-user.md (v3 only, repo rule).
const Usuario = z.object({
  data: z.object({
    billing_type: z.string(),
    wallet: z.object({ remaining_balance: z.number().nullish() }).nullish(),
    subscription: z
      .object({
        credits: z
          .object({
            premium_credits: z.object({ remaining: z.number() }).nullish(),
            add_on_credits: z.object({ remaining: z.number() }).nullish(),
          })
          .nullish(),
      })
      .nullish(),
    usage_based: z.object({ remaining_credits: z.number().nullish() }).nullish(),
  }),
})

async function chequearHeygen(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  const r = await leerJson(`${entrada.bases.heygen}/v3/users/me`, { "X-Api-Key": entrada.llave })
  if (!r.ok) return r
  const leido = Usuario.safeParse(r.cuerpo)
  if (!leido.success) return no("formato")
  if (entrada.motivo !== "cuota") return { ok: true }
  const d = leido.data.data
  const saldo =
    d.billing_type === "wallet"
      ? (d.wallet?.remaining_balance ?? 0)
      : d.billing_type === "subscription"
        ? (d.subscription?.credits?.premium_credits?.remaining ?? 0) +
          (d.subscription?.credits?.add_on_credits?.remaining ?? 0)
        : d.billing_type === "usage_based"
          ? (d.usage_based?.remaining_credits ?? 0)
          : 0
  return saldo > 0 ? { ok: true } : no("sin saldo")
}

/** One token of Sonnet 5.5 with thinking off (`between_tools` is its off switch, see anthropic/nucleo.ts). */
async function chequearClaude(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  const cliente = new Anthropic({ apiKey: entrada.llave, timeout: ESPERA_MS, maxRetries: 0 })
  try {
    await cliente.beta.messages.create({
      model: MODELO_DEL_CHEQUEO,
      max_tokens: 1,
      thinking: { type: "between_tools" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "ok" }],
    })
    return { ok: true }
  } catch (error) {
    const traducido = traducirErrorDeClaude(error, MODELO_DEL_CHEQUEO)
    if (traducido instanceof PausaDeProveedor) return no(`pausa ${traducido.motivo}`)
    if (traducido instanceof Error) return no(traducido.name)
    throw error
  }
}

async function chequearVoyage(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  try {
    await embeber({ clave: entrada.llave, textos: ["ok"], tipo: "query" })
    return { ok: true }
  } catch (error) {
    // Any answer that is not a good embedding keeps the pause; the next tick asks again.
    if (error instanceof Error) return no(error instanceof PausaDeProveedor ? `pausa ${error.motivo}` : error.name)
    throw error
  }
}

/** A failed check is a result, never an exception: the maintenance run must not fail every ten minutes. */
export function chequearProveedor(entrada: EntradaDeChequeo): Promise<ResultadoDeChequeo> {
  switch (entrada.proveedor) {
    case "elevenlabs":
      return chequearElevenlabs(entrada)
    case "heygen":
      return chequearHeygen(entrada)
    case "claude":
      return chequearClaude(entrada)
    case "voyage":
      return chequearVoyage(entrada)
  }
}
