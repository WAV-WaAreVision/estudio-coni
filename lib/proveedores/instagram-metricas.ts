import { z } from "zod"
import { consultar, leer } from "./instagram"

// Insights of the Instagram API with Instagram Login. Both calls need the permissions `instagram_business_basic` and
// `instagram_business_manage_insights`, and both answer `{ "data": [ ... ] }`.

/** The figures of one reel. A metric Instagram did not return is null: unknown is not zero. */
export interface MetricasDeReel {
  alcance: number | null
  guardados: number | null
  compartidos: number | null
  comentarios: number | null
  /** `ig_reels_avg_watch_time` as it came; see `segundosVistos` for the unit. */
  tiempoPromedio: number | null
}

const METRICAS_DE_REEL = "reach,saved,shares,comments,ig_reels_avg_watch_time"

const RespuestaDeReel = z.object({
  data: z.array(z.object({ name: z.string(), values: z.array(z.object({ value: z.number() })) })),
})

/**
 * `GET /<IG_MEDIA_ID>/insights?metric=...` returns, for each metric, `{ name, period: "lifetime", values: [{ value }] }`
 * (https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights). The names are
 * `reach` (unique accounts that saw the reel), `saved`, `shares`, `comments` and `ig_reels_avg_watch_time`. The page
 * lists them all as REELS metrics and gives no unit for the watch time.
 */
export async function leerMetricasDeReel(entrada: { token: string; mediaId: string }): Promise<MetricasDeReel> {
  const { token, mediaId } = entrada
  const cuerpo = await consultar(`/${encodeURIComponent(mediaId)}/insights`, { metric: METRICAS_DE_REEL }, token)
  const { data } = leer(RespuestaDeReel, cuerpo, "/{media}/insights")
  const valor = (nombre: string) => data.find((metrica) => metrica.name === nombre)?.values[0]?.value ?? null
  return {
    alcance: valor("reach"),
    guardados: valor("saved"),
    compartidos: valor("shares"),
    comentarios: valor("comments"),
    tiempoPromedio: valor("ig_reels_avg_watch_time"),
  }
}

const RespuestaDeCuenta = z.object({
  data: z.array(z.object({ name: z.string(), total_value: z.object({ value: z.number() }) })),
})

/**
 * `GET /<IG_ID>/insights?metric=profile_links_taps&metric_type=total_value&period=day&since=&until=` : taps on the
 * profile's address, call, email and text buttons (NOT on the link of the bio), `total_value` only, `since` and
 * `until` as Unix seconds. It needs an account with 100 followers or more, may lag up to 48 hours, and answers an
 * empty `data` when it has nothing, which is unknown and not zero
 * (https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights).
 */
export async function leerToquesDePerfil(entrada: {
  token: string
  cuentaId: string
  /** Start of the span, in milliseconds. */
  desde: number
  hasta: number
}): Promise<number | null> {
  const { token, cuentaId, desde, hasta } = entrada
  const cuerpo = await consultar(
    `/${encodeURIComponent(cuentaId)}/insights`,
    {
      metric: "profile_links_taps",
      metric_type: "total_value",
      period: "day",
      since: String(Math.floor(desde / 1000)),
      until: String(Math.floor(hasta / 1000)),
    },
    token,
  )
  const { data } = leer(RespuestaDeCuenta, cuerpo, "/{cuenta}/insights")
  return data.find((metrica) => metrica.name === "profile_links_taps")?.total_value.value ?? null
}
