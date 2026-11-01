/**
 * What the app deletes by itself, in days (spec D4: the register describes, the code deletes). Retention, backups
 * and the nightly `huella` step read their period here, and `inventario_de_datos.regla_de_borrado` names one of
 * these keys.
 */
export const REGLAS_DE_BORRADO = { videos_de_piezas: 30, respaldos: 30, huella_de_visitas: 1 } as const

export type ReglaDeBorrado = keyof typeof REGLAS_DE_BORRADO

export function esReglaDeBorrado(valor: string): valor is ReglaDeBorrado {
  return Object.hasOwn(REGLAS_DE_BORRADO, valor)
}

export type Discrepancia = { tipo: "sin_regla" } | { tipo: "otro_plazo"; dias: number }

/** Whether a row of the register says something different from what the code deletes. */
export function discrepanciaDeRegla(fila: {
  regla_de_borrado: string | null
  plazo_dias: number | null
}): Discrepancia | null {
  if (fila.regla_de_borrado === null) return null
  if (!esReglaDeBorrado(fila.regla_de_borrado)) return { tipo: "sin_regla" }
  const dias = REGLAS_DE_BORRADO[fila.regla_de_borrado]
  return fila.plazo_dias === dias ? null : { tipo: "otro_plazo", dias }
}

export function textoDeDiscrepancia(discrepancia: Discrepancia): string {
  if (discrepancia.tipo === "sin_regla") return "No coincide con lo que la app borra: la app no tiene esa regla"
  return `No coincide con lo que la app borra (${discrepancia.dias} ${discrepancia.dias === 1 ? "día" : "días"})`
}
