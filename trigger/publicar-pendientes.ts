import { schedules } from "@trigger.dev/sdk"
import { depsPublicacion } from "@/lib/produccion/deps-reales"
import { publicarPendientes } from "@/lib/publicacion/publicar"

/**
 * Every 5 minutes (design D3/A3), one run at a time. No retries: the next tick is 5 minutes away anyway, the lease
 * of `tomar_para_publicar` keeps a retry from touching a piece another run holds, and a retry that lands past the
 * 30-minute window would only find a piece to send back to Coni.
 */
export const CONFIGURACION_PUBLICAR = {
  id: "publicar-pendientes",
  cron: "*/5 * * * *",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  // Each piece can wait up to five minutes for Instagram to process its video.
  maxDuration: 1500,
} as const

export const publicarPendientesTask = schedules.task({
  ...CONFIGURACION_PUBLICAR,
  run: async () => publicarPendientes(depsPublicacion()),
})
