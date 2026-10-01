import { createClient } from "@supabase/supabase-js"
import { leerZona } from "@/lib/datos/metricas"
import { exigirEnv } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"
import { leerEnlaces } from "./config"
import type { DepsSalida } from "./salida"
import { secretoDeClics } from "./visitante"

/** A `service_role` client: the public page reads the links and counts clicks, and nothing else is open to it. */
export function clienteDeEnlaces() {
  return createClient<Database>(
    exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL),
    exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

const ZONA_POR_DEFECTO = "America/Santiago"

/** The days of the counter are the days of the app: the zone of `ajustes`, like Métricas groups them. */
export async function depsDeSalida(): Promise<DepsSalida> {
  const db = clienteDeEnlaces()
  let zona = ZONA_POR_DEFECTO
  try {
    zona = await leerZona(db)
  } catch (error) {
    // A failed read of the zone must not keep the visitor from the link: the usual zone is the right one anyway.
    console.error("/l/ir no pudo leer la zona horaria; uso la de siempre", error)
  }
  return {
    leerEnlaces: () => leerEnlaces(db),
    registrarClic: async (enlace, huella, dia) => {
      const { data, error } = await db.rpc("registrar_clic", { p_enlace: enlace, p_visitante: huella, p_dia: dia })
      if (error) throw new Error(`No pude registrar el clic: ${error.message}`, { cause: error })
      return data
    },
    ahora: () => Date.now(),
    zona,
    secreto: secretoDeClics(),
  }
}
