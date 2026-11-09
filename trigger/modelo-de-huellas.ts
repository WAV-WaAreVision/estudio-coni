import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { MODELOS_DE_HUELLAS } from "@/lib/dominio/parecido"
import { aplicarModeloDeHuellas, revertirModeloDeHuellas } from "@/lib/modelo/aplicar"
import { probarModeloDeHuellas } from "@/lib/modelo/probar"
import { depsFalla, depsModelo } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { COLA_DE_MANTENIMIENTO } from "./mantenimiento"

/**
 * Manual only (the dashboard's «Test» button or the Trigger MCP), never scheduled. On the maintenance queue, so the
 * topics jobs never run during a dry run, a switch or a revert (plan decision 3). No retries: a retry would pay again.
 */
export const CONFIGURACION_DEL_MODELO = { queue: COLA_DE_MANTENIMIENTO, retry: { maxAttempts: 1 } } as const

const Prueba = z.object({ prueba: z.string().uuid() })

export const probarModeloDeHuellasTask = schemaTask({
  id: "probar-modelo-de-huellas",
  schema: z.object({ modelo: z.enum(MODELOS_DE_HUELLAS).default("voyage-4") }),
  ...CONFIGURACION_DEL_MODELO,
  onFailure: alFallarDeTarea("probar-modelo-de-huellas", depsFalla),
  run: async ({ modelo }) => probarModeloDeHuellas(depsModelo(), { modelo }),
})

export const aplicarModeloDeHuellasTask = schemaTask({
  id: "aplicar-modelo-de-huellas",
  schema: Prueba,
  ...CONFIGURACION_DEL_MODELO,
  onFailure: alFallarDeTarea("aplicar-modelo-de-huellas", depsFalla),
  run: async ({ prueba }) => aplicarModeloDeHuellas(depsModelo(), { prueba }),
})

export const revertirModeloDeHuellasTask = schemaTask({
  id: "revertir-modelo-de-huellas",
  schema: Prueba,
  ...CONFIGURACION_DEL_MODELO,
  onFailure: alFallarDeTarea("revertir-modelo-de-huellas", depsFalla),
  run: async ({ prueba }) => revertirModeloDeHuellas(depsModelo(), { prueba }),
})
