export interface TonoDelMedidor {
  tono: "tinta" | "aviso"
  porcentaje: number
  alTope: boolean
}

/** Brandkit 9.15: the spend meter turns to aviso from 80 percent of the cap. */
export function tonoDelMedidor(gastado: number, tope: number): TonoDelMedidor {
  if (tope <= 0) return { tono: "tinta", porcentaje: 0, alTope: false }
  const porcentaje = Math.min(100, (gastado / tope) * 100)
  return { tono: porcentaje >= 80 ? "aviso" : "tinta", porcentaje, alTope: gastado >= tope }
}
