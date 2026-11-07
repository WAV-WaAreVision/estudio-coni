import type { SupabaseClient } from "@supabase/supabase-js"
import type { MotivoDePausa, PausaDeProveedor, ProveedorConPausa } from "@/lib/dominio/pausas"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsPausa {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
}

const NOMBRE: Record<ProveedorConPausa, string> = {
  elevenlabs: "ElevenLabs",
  heygen: "HeyGen",
  claude: "Claude (Anthropic)",
  voyage: "Voyage",
}

const MOTIVO: Record<MotivoDePausa, string> = { pago: "pago pendiente", cuota: "sin saldo", llave: "llave rechazada" }

const ARREGLO: Record<ProveedorConPausa, Record<MotivoDePausa, string>> = {
  elevenlabs: {
    pago: "Paga la factura pendiente en https://elevenlabs.io/app/subscription.",
    cuota: "Recarga caracteres o sube el plan en https://elevenlabs.io/app/subscription.",
    llave:
      "Revisa la llave en https://elevenlabs.io/app/settings/api-keys y guárdala de nuevo en Ajustes de Conidolly.",
  },
  heygen: {
    pago: "Revisa el pago en https://app.heygen.com (sección API).",
    cuota: "Recarga el saldo de API en https://app.heygen.com (sección API).",
    llave: "Revisa la llave en https://app.heygen.com y guárdala de nuevo en Ajustes de Conidolly.",
  },
  claude: {
    pago: "Revisa los datos de pago en https://platform.claude.com.",
    cuota: "Compra créditos en https://platform.claude.com (Plans & Billing).",
    llave: "Revisa la llave en https://platform.claude.com y guárdala de nuevo en Ajustes de Conidolly.",
  },
  voyage: {
    pago: "Revisa el pago en https://dashboard.voyageai.com.",
    cuota: "Revisa el saldo en https://dashboard.voyageai.com.",
    llave: "Revisa VOYAGE_API_KEY en las variables de Trigger.dev.",
  },
}

export function asuntoDePausa(pausa: PausaDeProveedor): string {
  return `${NOMBRE[pausa.proveedor]} en pausa: ${MOTIVO[pausa.motivo]}`
}

export function cuerpoDePausa(pausa: PausaDeProveedor): string {
  return [
    `Proveedor: ${NOMBRE[pausa.proveedor]}`,
    `Motivo: ${MOTIVO[pausa.motivo]}`,
    `Detalle: ${pausa.detalle}`,
    `Qué arreglar: ${ARREGLO[pausa.proveedor][pausa.motivo]}`,
    "Mientras tanto, Conidolly no llama a este proveedor y Coni ve que está en pausa. El mantenimiento lo revisa cada 10 minutos y avisa a Coni cuando vuelve a funcionar.",
  ].join("\n")
}

/**
 * Spec 2026-11-07, decision 3: opens the provider's pause (an open one is kept as it is) and emails WAV once per pause.
 * Coni gets no notice: the text on the piece or the screen says it. Only the caller that claimed the email sends it,
 * so concurrent callers send one; it is marked after it is sent (plan amendment A1), so a failed email is sent again
 * by a later caller once the claim is five minutes old instead of being lost.
 */
export async function abrirPausa(deps: DepsPausa, pausa: PausaDeProveedor): Promise<{ nueva: boolean }> {
  const { data, error } = await deps.db.rpc("abrir_pausa_de_proveedor", {
    p_proveedor: pausa.proveedor,
    p_motivo: pausa.motivo,
    p_detalle: pausa.detalle,
  })
  if (error) throw new Error(`No pude abrir la pausa de ${pausa.proveedor}: ${error.message}`, { cause: error })
  const fila = data[0]
  if (!fila) throw new Error(`abrir_pausa_de_proveedor no devolvió la pausa de ${pausa.proveedor}.`)
  if (fila.avisar) {
    await deps.avisos.aWav(asuntoDePausa(pausa), cuerpoDePausa(pausa))
    const { error: errorAlMarcar } = await deps.db.rpc("marcar_pausa_avisada", { p_id: fila.pausa_id })
    if (errorAlMarcar) {
      throw new Error(`No pude marcar como avisada la pausa ${fila.pausa_id}: ${errorAlMarcar.message}`, {
        cause: errorAlMarcar,
      })
    }
  }
  return { nueva: fila.nueva }
}
