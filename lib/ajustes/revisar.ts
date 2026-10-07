import type { SupabaseClient } from "@supabase/supabase-js"
import { leerSecreto } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { baseDe } from "@/lib/proveedores/bases"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { verificarVoz } from "@/lib/proveedores/elevenlabs"
import { verificarAnthropic, verificarHeygen } from "@/lib/proveedores/verificaciones"
import type { Database } from "@/lib/supabase/database.types"
import {
  DIAS_DE_AVISO_DE_INSTAGRAM,
  DIAS_DE_AVISO_DE_LINKEDIN,
  type EstadoDeCuenta,
  type NombreDeCuenta,
} from "./estado"

export interface DepsDeRevision {
  /** A `service_role` client: the keys are only readable with it. */
  servicio: SupabaseClient<Database>
  ahora: () => number
}

const DIA_MS = 24 * 60 * 60 * 1000

function instagram(
  token: string | null,
  ajustes: { meta_cuenta_id: string | null; meta_token_expira_en: string | null },
  ahora: number,
): EstadoDeCuenta {
  if (!token || !ajustes.meta_cuenta_id) return { cuenta: "instagram", estado: "falta" }
  if (!ajustes.meta_token_expira_en) return { cuenta: "instagram", estado: "lista" }
  const expiraEn = Date.parse(ajustes.meta_token_expira_en)
  if (expiraEn <= ahora) return { cuenta: "instagram", estado: "vencida" }
  if (expiraEn - ahora <= DIAS_DE_AVISO_DE_INSTAGRAM * DIA_MS) return { cuenta: "instagram", estado: "vence", expiraEn }
  return { cuenta: "instagram", estado: "lista" }
}

/** LinkedIn has no refresh token (F12): its state is read from the stored expiry, without calling it. */
function linkedin(
  ajustes: { linkedin_miembro: string | null; linkedin_nombre: string | null; linkedin_token_expira_en: string | null },
  ahora: number,
): EstadoDeCuenta {
  if (!ajustes.linkedin_miembro || !ajustes.linkedin_token_expira_en) return { cuenta: "linkedin", estado: "falta" }
  const expiraEn = Date.parse(ajustes.linkedin_token_expira_en)
  if (expiraEn <= ahora) return { cuenta: "linkedin", estado: "vencida" }
  if (expiraEn - ahora <= DIAS_DE_AVISO_DE_LINKEDIN * DIA_MS) {
    return { cuenta: "linkedin", estado: "vence", expiraEn, nombre: ajustes.linkedin_nombre }
  }
  return { cuenta: "linkedin", estado: "lista", nombre: ajustes.linkedin_nombre }
}

function deVerificacion(
  cuenta: NombreDeCuenta,
  resultado: { ok: true } | { ok: false; rechazada: boolean; detalle: string },
): EstadoDeCuenta {
  if (resultado.ok) return { cuenta, estado: "lista" }
  return resultado.rechazada
    ? { cuenta, estado: "rechazada", motivo: resultado.detalle }
    : { cuenta, estado: "sin_respuesta" }
}

async function elevenlabs(clave: string | null, produccion: unknown): Promise<EstadoDeCuenta> {
  if (!clave) return { cuenta: "elevenlabs", estado: "falta" }
  let vozId: string | null
  try {
    vozId = leerConfigProduccion(produccion).elevenlabs.voice_id
  } catch (error) {
    // A configuration that is not there yet (or not valid) means her voice is not set up.
    if (error instanceof FallaDeConfiguracion) return { cuenta: "elevenlabs", estado: "falta" }
    throw error
  }
  if (!vozId) return { cuenta: "elevenlabs", estado: "falta" }

  const resultado = await verificarVoz({
    clave,
    voiceId: vozId,
    base: baseDe(process.env, "ELEVENLABS_BASE_URL", "https://api.elevenlabs.io"),
  })
  if (resultado.ok) return { cuenta: "elevenlabs", estado: "lista" }
  // Any 4xx (a refused key, a voice that does not exist) is for Coni; no status or a 5xx is the provider's.
  const deCliente =
    resultado.http !== undefined && resultado.http >= 400 && resultado.http < 500 && resultado.http !== 429
  return deCliente
    ? { cuenta: "elevenlabs", estado: "rechazada", motivo: resultado.motivo }
    : { cuenta: "elevenlabs", estado: "sin_respuesta" }
}

/** A check that blows up is "could not check", and WAV sees why in the log; it never takes the whole screen down. */
async function sinCaer(cuenta: NombreDeCuenta, revision: () => Promise<EstadoDeCuenta>): Promise<EstadoDeCuenta> {
  try {
    return await revision()
  } catch (error) {
    console.error(`No pude revisar la cuenta de ${cuenta}`, error)
    return { cuenta, estado: "sin_respuesta" }
  }
}

/**
 * Looks at the four accounts for the status block of Ajustes: Instagram by the expiry of its token, the other three by
 * asking the provider whether the key Coni entered still works (a call that spends nothing).
 */
export async function revisarCuentas(deps: DepsDeRevision): Promise<EstadoDeCuenta[]> {
  const { servicio } = deps
  const { data: ajustes, error } = await servicio
    .from("ajustes")
    .select(
      "meta_cuenta_id, meta_token_expira_en, produccion, linkedin_miembro, linkedin_nombre, linkedin_token_expira_en",
    )
    .maybeSingle()
  if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
  if (!ajustes) throw new Error("Falta la fila de ajustes.")

  const [meta, heygen, elevenlabsClave, anthropic] = await Promise.all(
    (["meta", "heygen", "elevenlabs", "anthropic"] as const).map((nombre) => leerSecreto(servicio, nombre)),
  )

  return Promise.all([
    sinCaer("instagram", async () => instagram(meta ?? null, ajustes, deps.ahora())),
    sinCaer("heygen", async () =>
      heygen
        ? deVerificacion("heygen", await verificarHeygen({ clave: heygen }))
        : { cuenta: "heygen", estado: "falta" },
    ),
    sinCaer("elevenlabs", () => elevenlabs(elevenlabsClave ?? null, ajustes.produccion)),
    sinCaer("anthropic", async () =>
      anthropic
        ? deVerificacion("anthropic", await verificarAnthropic({ clave: anthropic }))
        : { cuenta: "anthropic", estado: "falta" },
    ),
    sinCaer("linkedin", async () => linkedin(ajustes, deps.ahora())),
  ])
}
