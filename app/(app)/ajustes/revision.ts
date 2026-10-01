import { cache } from "react"
import { clienteDeServicio } from "@/lib/acciones/servidor"
import type { EstadoDeCuenta } from "@/lib/ajustes/estado"
import { revisarCuentas } from "@/lib/ajustes/revisar"

const CUENTAS = ["instagram", "heygen", "elevenlabs", "anthropic"] as const

/**
 * The live checks of the accounts, once per request. A failure of the check itself must not take Ajustes down: she
 * can still change her settings, so every account reads as "could not check" (docs/PRODUCT.md, states of Ajustes).
 */
export const revisionDeCuentas = cache(async (): Promise<EstadoDeCuenta[]> => {
  try {
    return await revisarCuentas({ servicio: clienteDeServicio(), ahora: () => Date.now() })
  } catch (error) {
    console.error("No pude revisar las cuentas", error)
    return CUENTAS.map((cuenta) => ({ cuenta, estado: "sin_respuesta" as const }))
  }
})
