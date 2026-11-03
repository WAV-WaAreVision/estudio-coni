// Ported from Ingesta's lib/ingesta/modelo.ts (change 29b). Coni chose these role labels; keep them.

export const TIPOS_DE_MATERIAL = ["documento", "link", "audio", "video", "imagen", "post"] as const
export type TipoDeMaterial = (typeof TIPOS_DE_MATERIAL)[number]

export const ROLES = ["voz_propia", "referente", "evidencia", "estrategia"] as const
export type Rol = (typeof ROLES)[number]

export const ETIQUETA_DE_ROL: Record<Rol, string> = {
  voz_propia: "Lo dijo Coni",
  referente: "Referente",
  evidencia: "Estudio o libro",
  estrategia: "Estrategia interna",
}

export const AYUDA_DE_ROL: Record<Rol, string> = {
  voz_propia: "Una charla, audio o texto de ella: sus ideas con sus palabras.",
  referente: "Alguien a quien Coni sigue: sirve para ver cómo lo explica.",
  evidencia: "Un estudio, libro o artículo que respalda con datos lo que se dice.",
  estrategia: "Un plan, una guía o un documento del equipo, no una afirmación sobre el tema.",
}

export const ETIQUETA_DE_TIPO: Record<TipoDeMaterial, string> = {
  documento: "Documento",
  link: "Enlace",
  audio: "Audio",
  video: "Video",
  imagen: "Imagen",
  post: "Post",
}

/** Coni herself is created by the seed, so `coni` is not a kind a person can pick. */
export const TIPOS_DE_AUTOR_NUEVO = ["persona", "cuenta", "institucion"] as const
export type TipoDeAutorNuevo = (typeof TIPOS_DE_AUTOR_NUEVO)[number]

export const ETIQUETA_DE_TIPO_DE_AUTOR: Record<TipoDeAutorNuevo, string> = {
  persona: "Persona",
  cuenta: "Cuenta de redes",
  institucion: "Institución",
}

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor)
}

export function esTipoDeAutorNuevo(valor: string): valor is TipoDeAutorNuevo {
  return (TIPOS_DE_AUTOR_NUEVO as readonly string[]).includes(valor)
}

function esTipo(valor: string): valor is TipoDeMaterial {
  return (TIPOS_DE_MATERIAL as readonly string[]).includes(valor)
}

export function etiquetaDeRol(rol: string): string {
  return esRol(rol) ? ETIQUETA_DE_ROL[rol] : rol
}

export function etiquetaDeTipo(tipo: string): string {
  return esTipo(tipo) ? ETIQUETA_DE_TIPO[tipo] : tipo
}
