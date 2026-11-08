import { aResultado, type Resultado } from "@/lib/acciones/resultado"
import type { Notificador } from "@/lib/proveedores/avisos"

/**
 * Issue 111: a screen that could not load tells WAV by itself instead of asking Coni to. One email a day per screen and
 * digest (Resend's Idempotency-Key): a failure she reopens many times, or one that hits every screen, is told once.
 * Errors without a digest (a client failure) share one email a day per screen.
 */
export function avisarErrorDePantalla(
  deps: { avisos: () => Notificador; ahora: () => string },
  entrada: { registro: string; digest?: string },
): Promise<Resultado> {
  return aResultado("avisarErrorDePantalla", async () => {
    const digest = entrada.digest ?? "sin-digest"
    await deps
      .avisos()
      .aWav(
        "Coni vio una pantalla de error",
        [
          `Pantalla: ${entrada.registro}`,
          `Digest: ${digest}`,
          "Búscalo en los registros de Vercel por el digest o por el texto de la pantalla.",
        ].join("\n"),
        `pantalla:${entrada.registro}:${digest}:${deps.ahora().slice(0, 10)}`,
      )
    return {}
  })
}
