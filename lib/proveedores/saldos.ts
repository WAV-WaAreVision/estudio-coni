import { z } from "zod"
import type { SaldoElevenlabs, SaldoHeygen } from "@/lib/dominio/saldos"

// A balance is a hint on a screen: it must not hold the page for long.
const ESPERA_MS = 5_000

type Respuesta = { ok: true; cuerpo: unknown } | { ok: false; motivo: string }

/** Never puts the body or the key in the reason: a provider may echo the key back in an error. */
async function pedirJson(url: string, cabeceras: Record<string, string>): Promise<Respuesta> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(ESPERA_MS) })
  } catch {
    // Unreachable or too slow: the screen says it could not see the balance and does not block.
    return { ok: false, motivo: "sin_conexion" }
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
  character_count: z.number(),
  character_limit: z.number(),
  next_character_count_reset_unix: z.number().nullish(),
  can_extend_character_limit: z.boolean().nullish(),
  allowed_to_extend_character_limit: z.boolean().nullish(),
})

export async function leerSaldoElevenlabs(entrada: { clave: string; base: string }): Promise<SaldoElevenlabs> {
  const respuesta = await pedirJson(`${entrada.base}/v1/user/subscription`, { "xi-api-key": entrada.clave })
  if (!respuesta.ok) return respuesta
  const leida = Suscripcion.safeParse(respuesta.cuerpo)
  if (!leida.success) return { ok: false, motivo: "formato" }
  const datos = leida.data
  return {
    ok: true,
    usados: datos.character_count,
    limite: datos.character_limit,
    renuevaEn: datos.next_character_count_reset_unix
      ? new Date(datos.next_character_count_reset_unix * 1000).toISOString()
      : null,
    // Both must hold: the plan can bill extra characters and the account allows it.
    puedeExceder: datos.can_extend_character_limit === true && datos.allowed_to_extend_character_limit === true,
  }
}

// https://developers.heygen.com/reference/get-current-user.md: billing_type wallet | subscription | usage_based.
const Usuario = z.object({
  data: z.object({
    billing_type: z.string(),
    wallet: z.object({ currency: z.string(), remaining_balance: z.number().nullish() }).nullish(),
  }),
})

export async function leerSaldoHeygen(entrada: { clave: string; base: string }): Promise<SaldoHeygen> {
  const respuesta = await pedirJson(`${entrada.base}/v3/users/me`, { "X-Api-Key": entrada.clave })
  if (!respuesta.ok) return respuesta
  const leida = Usuario.safeParse(respuesta.cuerpo)
  if (!leida.success) return { ok: false, motivo: "formato" }
  const { billing_type: facturacion, wallet } = leida.data.data
  const saldo = wallet?.remaining_balance
  if (
    facturacion === "wallet" &&
    typeof saldo === "number" &&
    (wallet?.currency === "usd" || wallet?.currency === "credits")
  ) {
    return { ok: true, tipo: "billetera", moneda: wallet.currency === "usd" ? "usd" : "creditos", saldo }
  }
  return { ok: true, tipo: "sin_billetera", facturacion }
}
