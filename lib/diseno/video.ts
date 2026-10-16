import { mmss } from "@/lib/formato"

/** The badge on the video while it plays and until it was watched whole (decision 11): "faltan 0:24". */
export function faltanDelVideo(entrada: {
  duracion: number
  tiempo: number
  reproduciendo: boolean
  visto: boolean
}): string | null {
  const { duracion, tiempo, reproduciendo, visto } = entrada
  if (visto || !reproduciendo || !(duracion > 0)) return null
  return `faltan ${mmss(Math.max(0, duracion - tiempo))}`
}
