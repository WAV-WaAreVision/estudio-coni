import type { Notificador } from "@/lib/proveedores/avisos"

export type RedDeConexion = "instagram" | "linkedin"

// Issue 111: the two outcomes only WAV can fix. The rest are hers to retry (cancel, refusal, expired state, missing
// permissions) or no failure at all.
const CORREOS: Record<RedDeConexion, Record<"sin_app" | "fallo", { asunto: string; detalle: string }>> = {
  instagram: {
    sin_app: {
      asunto: "Falta configurar la app de Meta en Conidolly",
      detalle: "Coni intentó conectar Instagram y faltan META_APP_ID, META_APP_SECRET o META_REDIRECT_URI en Vercel.",
    },
    fallo: {
      asunto: "No pude conectar Instagram",
      detalle: "Coni intentó conectar Instagram y falló. El error está en los registros de Vercel: «No pude conectar Instagram».",
    },
  },
  linkedin: {
    sin_app: {
      asunto: "Falta configurar la app de LinkedIn en Conidolly",
      detalle:
        "Coni intentó conectar LinkedIn y faltan LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET o LINKEDIN_REDIRECT_URI en Vercel.",
    },
    fallo: {
      asunto: "No pude conectar LinkedIn",
      detalle: "Coni intentó conectar LinkedIn y falló. El error está en los registros de Vercel: «No pude conectar LinkedIn».",
    },
  },
}

/**
 * Tells WAV when a connection ends in a failure only WAV can fix, once a day per network and outcome (Resend's
 * Idempotency-Key). Answers whether the email went out: the screen says Federico knows only then.
 */
export async function avisarConexionFallida(
  deps: { avisos: () => Notificador; ahora: () => string },
  red: RedDeConexion,
  motivo: string,
): Promise<boolean> {
  if (motivo !== "sin_app" && motivo !== "fallo") return false
  const correo = CORREOS[red][motivo]
  try {
    await deps.avisos().aWav(correo.asunto, correo.detalle, `conexion:${red}:${motivo}:${deps.ahora().slice(0, 10)}`)
    return true
  } catch (error) {
    // She still gets the way forward; only the «Le avisé a Federico.» is left out.
    console.error(`No pude avisarle a WAV que falló la conexión con ${red}`, error)
    return false
  }
}
