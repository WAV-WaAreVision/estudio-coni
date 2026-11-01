import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { leerPresupuesto } from "@/lib/datos/pantallas"
import { canonicos, type Destino, destinosDe, destinosValidos } from "@/lib/dominio/destinos"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { dolares } from "@/lib/formato"
import {
  limitePorDefecto,
  MAXIMO_DEL_LIMITE_USD,
  MAXIMO_DEL_TOPE_USD,
  PASO_DEL_PRESUPUESTO_USD,
} from "@/lib/presupuesto/presentar"
import { baseDe } from "@/lib/proveedores/bases"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { verificarVoz } from "@/lib/proveedores/elevenlabs"
import { verificarAnthropic, verificarHeygen } from "@/lib/proveedores/verificaciones"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsAjustes {
  /** Coni's session: row level security and `guardar_secreto` only answer to her. */
  db: Db
  ahora: () => string
}

const dias = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .transform((valor) => [...new Set(valor)].sort((a, b) => a - b))

// Where reels go by default: a non-empty list of known networks without repeats, stored in the canonical order.
const destinos = z
  .array(z.string())
  .refine((valor): valor is Destino[] => destinosValidos(valor))
  .transform((valor) => canonicos(valor as Destino[]))

const CambioDeAjuste = z.discriminatedUnion("campo", [
  z.object({ campo: z.literal("meta"), valor: z.enum(["consultas", "talleres", "marca"]) }),
  z.object({ campo: z.literal("dias"), valor: dias }),
  z.object({ campo: z.literal("hora"), valor: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }),
  z.object({ campo: z.literal("tope"), valor: z.number().min(0).max(MAXIMO_DEL_TOPE_USD) }),
  z.object({
    campo: z.literal("limite"),
    valor: z.number().min(0).max(MAXIMO_DEL_LIMITE_USD).multipleOf(PASO_DEL_PRESUPUESTO_USD).nullable(),
  }),
  z.object({ campo: z.literal("motor_semanal"), valor: z.boolean() }),
  z.object({ campo: z.literal("fusiones_nocturnas"), valor: z.boolean() }),
  z.object({ campo: z.literal("avisos_resumen"), valor: z.boolean() }),
  z.object({ campo: z.literal("avisos_urgentes"), valor: z.boolean() }),
  z.object({ campo: z.literal("destinos"), valor: destinos }),
])

export type CambioDeAjuste = z.infer<typeof CambioDeAjuste>

const COLUMNAS = {
  meta: "meta",
  dias: "dias_publicacion",
  hora: "hora_publicacion",
  tope: "tope_mensual_usd",
  limite: "limite_duro_usd",
  motor_semanal: "motor_semanal_activo",
  fusiones_nocturnas: "fusiones_nocturnas_activas",
  avisos_resumen: "avisos_resumen",
  avisos_urgentes: "avisos_urgentes",
  destinos: "destinos_por_defecto",
} as const

function limiteBajoElTope(tope: number): string {
  return `Tu límite no puede ser menor que tu tope de ${dolares(tope)}.`
}

const ERROR_DE_CAMBIO = "No entendí ese cambio. Vuelve a abrir Ajustes."

type FilaDeAjustes = Database["public"]["Tables"]["ajustes"]["Row"]

function valorActual(fila: FilaDeAjustes, campo: CambioDeAjuste["campo"]): CambioDeAjuste {
  switch (campo) {
    case "meta":
      return CambioDeAjuste.parse({ campo, valor: fila.meta })
    case "dias":
      return CambioDeAjuste.parse({ campo, valor: fila.dias_publicacion })
    case "hora":
      return { campo, valor: fila.hora_publicacion.slice(0, 5) }
    case "tope":
      return { campo, valor: Number(fila.tope_mensual_usd) }
    case "limite":
      return { campo, valor: fila.limite_duro_usd === null ? null : Number(fila.limite_duro_usd) }
    case "motor_semanal":
      return { campo, valor: fila.motor_semanal_activo }
    case "fusiones_nocturnas":
      return { campo, valor: fila.fusiones_nocturnas_activas }
    case "avisos_resumen":
      return { campo, valor: fila.avisos_resumen }
    case "avisos_urgentes":
      return { campo, valor: fila.avisos_urgentes }
    case "destinos":
      return { campo, valor: destinosDe(fila.destinos_por_defecto) }
  }
}

function columnaCon(cambio: CambioDeAjuste): Database["public"]["Tables"]["ajustes"]["Update"] {
  return { [COLUMNAS[cambio.campo]]: cambio.valor }
}

/**
 * Settings are edited in place and save by themselves (docs/PRODUCT.md, Ajustes). The answer carries the value that was
 * there, so "Deshacer" is the same call with it. What is already approved keeps its date: a piece carries its own
 * approved time, and nothing here reads or moves it. Every change is logged by the database with Coni as the actor.
 */
export function guardarAjuste(
  deps: DepsAjustes,
  entrada: unknown,
): Promise<Resultado<{ anterior: CambioDeAjuste; aviso?: string }>> {
  return aResultado("guardarAjuste", async () => {
    const cambio = CambioDeAjuste.safeParse(entrada)
    if (!cambio.success) throw new Falla(ERROR_DE_CAMBIO)

    const { data: antes, error } = await deps.db.from("ajustes").select("*").maybeSingle()
    if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
    if (!antes) throw new Error("Falta la fila de ajustes.")

    if (cambio.data.campo === "limite" && cambio.data.valor !== null && cambio.data.valor < antes.tope_mensual_usd) {
      throw new Falla(limiteBajoElTope(antes.tope_mensual_usd))
    }
    // D5: a cap above the limit she set brings the limit back to twice the cap, in the same write, so the database
    // check (limite_no_bajo_el_tope) never refuses it.
    const vuelveAlDoble =
      cambio.data.campo === "tope" &&
      antes.limite_duro_usd !== null &&
      cambio.data.valor > Number(antes.limite_duro_usd)
    const columnas = vuelveAlDoble ? { ...columnaCon(cambio.data), limite_duro_usd: null } : columnaCon(cambio.data)

    const { data: despues, error: errorAlGuardar } = await deps.db
      .from("ajustes")
      .update(columnas)
      .eq("id", true)
      .select()
      .maybeSingle()
    if (errorAlGuardar?.code === "23514" && errorAlGuardar.message.includes("limite_no_bajo_el_tope")) {
      // The cap rose in another tab between our read and this write: answer with the cap that won.
      const { data: ahora, error: errorAlReleer } = await deps.db
        .from("ajustes")
        .select("tope_mensual_usd")
        .maybeSingle()
      if (errorAlReleer) throw new Error(`No pude leer los ajustes: ${errorAlReleer.message}`, { cause: errorAlReleer })
      throw new Falla(limiteBajoElTope(ahora?.tope_mensual_usd ?? antes.tope_mensual_usd))
    }
    if (errorAlGuardar)
      throw new Error(`No pude guardar el cambio: ${errorAlGuardar.message}`, { cause: errorAlGuardar })
    // Row level security answers "no rows" to anybody who is not Coni.
    if (!despues) throw new Error("La base no guardó el cambio de ajustes.")

    const resultado: { anterior: CambioDeAjuste; aviso?: string } = { anterior: valorActual(antes, cambio.data.campo) }
    if (cambio.data.campo === "tope" || cambio.data.campo === "limite") {
      const presupuesto = await leerPresupuesto(deps.db, Date.parse(deps.ahora()), despues.zona)
      const frases: string[] = []
      if (cambio.data.campo === "tope" && vuelveAlDoble) {
        const doble = limitePorDefecto(cambio.data.valor)
        // A month she reactivated keeps its own limit (P10): the reset only reaches the months after it.
        frases.push(
          presupuesto.limite === doble
            ? `Tu límite volvió al doble del tope: ${dolares(doble)}`
            : `Tu límite volvió al doble del tope: ${dolares(doble)} desde el próximo mes.`,
        )
      }
      if (presupuesto.usado >= presupuesto.limite) {
        frases.push(
          `Ya gastaste ${dolares(presupuesto.usado)}; con este límite lo nuevo queda en pausa hasta el próximo mes. Lo que ya firmaste sigue.`,
        )
      }
      if (frases.length > 0) {
        resultado.aviso = frases
          .map((frase, i) => (i < frases.length - 1 && !frase.endsWith(".") ? `${frase}.` : frase))
          .join(" ")
      }
    }
    return resultado
  })
}

export const CUENTAS_CON_LLAVE = ["heygen", "elevenlabs", "anthropic"] as const
export type CuentaConLlave = (typeof CUENTAS_CON_LLAVE)[number]

const NOMBRE: Record<CuentaConLlave, string> = { heygen: "HeyGen", elevenlabs: "ElevenLabs", anthropic: "Claude" }

const EntradaDeLlave = z.object({
  cuenta: z.enum(CUENTAS_CON_LLAVE),
  // A key is one run of characters: a pasted line break or a space inside means something else got copied.
  llave: z.string().trim().min(8).max(400).regex(/^\S+$/),
})

export type EstadoDeLlave = "comprobada" | "sin_comprobar" | "sin_voz"

async function comprobar(deps: DepsAjustes, cuenta: CuentaConLlave, llave: string) {
  switch (cuenta) {
    case "heygen":
      return verificarHeygen({ clave: llave })
    case "anthropic":
      return verificarAnthropic({ clave: llave })
    case "elevenlabs": {
      const { data, error } = await deps.db.from("ajustes").select("produccion").maybeSingle()
      if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
      let vozId: string | null = null
      try {
        vozId = leerConfigProduccion(data?.produccion ?? {}).elevenlabs.voice_id
      } catch (falla) {
        // A configuration that is missing or invalid means her voice is not set up yet.
        if (!(falla instanceof FallaDeConfiguracion)) throw falla
      }
      if (!vozId) return "sin_voz" as const
      const resultado = await verificarVoz({
        clave: llave,
        voiceId: vozId,
        base: baseDe(process.env, "ELEVENLABS_BASE_URL", "https://api.elevenlabs.io"),
      })
      if (resultado.ok) return { ok: true as const }
      const deCliente =
        resultado.http !== undefined && resultado.http >= 400 && resultado.http < 500 && resultado.http !== 429
      return { ok: false as const, rechazada: deCliente, detalle: resultado.motivo }
    }
  }
}

/**
 * Coni pastes a key in Ajustes: it is checked with its provider first and only then saved (encrypted, in Vault), so a
 * bad paste never replaces a key that works. If the provider cannot be reached the key is saved and she is told it
 * was not checked.
 */
export function guardarLlave(deps: DepsAjustes, entrada: unknown): Promise<Resultado<{ estado: EstadoDeLlave }>> {
  return aResultado("guardarLlave", async () => {
    const datos = EntradaDeLlave.safeParse(entrada)
    if (!datos.success) throw new Falla("Pega la llave completa, sin espacios.")
    const { cuenta, llave } = datos.data

    const verificacion = await comprobar(deps, cuenta, llave)
    if (verificacion !== "sin_voz" && !verificacion.ok && verificacion.rechazada) {
      throw new Falla(`${NOMBRE[cuenta]} no aceptó esa llave. Revisa que la copiaste completa.`)
    }

    const { error } = await deps.db.rpc("guardar_secreto", { p_nombre: cuenta, p_valor: llave })
    if (error) throw new Error(`No pude guardar la llave de ${cuenta}: ${error.message}`, { cause: error })

    if (verificacion === "sin_voz") return { estado: "sin_voz" as const }
    return { estado: verificacion.ok ? ("comprobada" as const) : ("sin_comprobar" as const) }
  })
}
