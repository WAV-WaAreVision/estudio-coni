export const PILARES = ["pareja", "deseo", "autoestima", "limites", "bienestar"] as const
export type Pilar = (typeof PILARES)[number]

/** The names Coni knows her pillars by (editorial guide); the colour of a pillar is never its only signal. */
export const NOMBRE_DE_PILAR: Record<Pilar, string> = {
  pareja: "Pareja y conversación",
  deseo: "Deseo y sexualidad",
  autoestima: "Autoestima",
  limites: "Género y límites",
  bienestar: "Bienestar emocional",
}
