import { NOMBRE_DE_LA_APP } from "@/lib/diseno/marca"

/** The kinds of notice Coni gets (design "Avisos a Coni"); `avisos.tipo` in the database accepts exactly these. */
export const TIPOS_DE_AVISO = [
  "ideas_propuestas",
  "guion_listo",
  "video_listo",
  "error_definitivo",
  "publicado",
  "tope_alcanzado",
  "instagram_por_vencer",
  "recordatorio_48h",
  "listo_para_subir",
] as const
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number]

export type CanalDeAviso = "push" | "correo"

export function esTipoDeAviso(valor: string): valor is TipoDeAviso {
  return (TIPOS_DE_AVISO as readonly string[]).includes(valor)
}

export function esCanalDeAviso(valor: string): valor is CanalDeAviso {
  return valor === "push" || valor === "correo"
}

/**
 * What identifies a notice. `clave` is the dedup key: the same event (a retried run) has the same key and is stored
 * once. `piezaId` is the piece the notice opens when she taps it.
 */
export interface DatosDeAviso {
  tipo: TipoDeAviso
  clave: string
  piezaId?: string
}

/** What a push carries. The words come from the kind, never from the notice's text: a lock screen is public. */
export interface MensajePush {
  titulo: string
  cuerpo: string
  url: string
}

export const TITULO_DE_PUSH = NOMBRE_DE_LA_APP

const CUERPO_DE_PUSH: Record<TipoDeAviso, string> = {
  ideas_propuestas: "Tienes ideas nuevas para elegir",
  guion_listo: "Tienes un guion listo para revisar",
  video_listo: "Tienes un video listo para revisar",
  error_definitivo: "Algo no salió como esperábamos. Mira qué pasó",
  publicado: "Tu reel ya está publicado",
  tope_alcanzado: "Llegaste al tope de gasto de este mes",
  instagram_por_vencer: "Tu conexión con Instagram necesita atención",
  recordatorio_48h: "Tienes algo esperando tu firma",
  listo_para_subir: "Tu reel está listo para subir",
}

/** Where tapping a notice leads: the piece it is about, or Inicio. Never an approve action. */
export function rutaDeAviso(aviso: { tipo: TipoDeAviso; piezaId?: string | null }): string {
  if (!aviso.piezaId) return "/"
  return aviso.tipo === "guion_listo" ? `/guion/${aviso.piezaId}` : `/video/${aviso.piezaId}`
}

export function mensajePush(aviso: { tipo: TipoDeAviso; piezaId?: string | null }): MensajePush {
  return { titulo: TITULO_DE_PUSH, cuerpo: CUERPO_DE_PUSH[aviso.tipo], url: rutaDeAviso(aviso) }
}
