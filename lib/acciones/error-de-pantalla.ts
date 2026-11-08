import { aResultado, type Resultado } from "@/lib/acciones/resultado"
import type { Notificador } from "@/lib/proveedores/avisos"

/**
 * Issue 111: a screen that could not load tells WAV by itself instead of asking Coni to. One email a day per screen
 * (Resend's Idempotency-Key), whatever the digest: a digest can change with every occurrence, and the rest of the
 * day's failures are in the Vercel logs.
 */
export function avisarErrorDePantalla(
  deps: { avisos: () => Notificador; ahora: () => string },
  entrada: { registro: string; digest?: string },
): Promise<Resultado> {
  return aResultado("avisarErrorDePantalla", async () => {
    const digest = entrada.digest ?? "sin digest"
    await deps
      .avisos()
      .aWav(
        "Coni vio una pantalla de error",
        [
          `Pantalla: ${entrada.registro}`,
          `Digest: ${digest}`,
          "Búscalo en los registros de Vercel por el digest o por el texto de la pantalla.",
        ].join("\n"),
        `pantalla:${entrada.registro}:${deps.ahora().slice(0, 10)}`,
      )
    return {}
  })
}
