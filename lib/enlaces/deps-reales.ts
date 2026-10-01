import { createClient } from "@supabase/supabase-js"
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

export function depsDeSalida(): DepsSalida {
  const db = clienteDeEnlaces()
  return {
    leerEnlaces: () => leerEnlaces(db),
    registrarClic: async (enlace, huella, dia) => {
      const { data, error } = await db.rpc("registrar_clic", { p_enlace: enlace, p_visitante: huella, p_dia: dia })
      if (error) throw new Error(`No pude registrar el clic: ${error.message}`, { cause: error })
      return data
    },
    ahora: () => Date.now(),
    zona: "America/Santiago",
    secreto: secretoDeClics(),
  }
}
