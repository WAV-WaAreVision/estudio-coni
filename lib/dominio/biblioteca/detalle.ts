import { marcadoConMotivo } from "./estado"
import { EVIDENCIA, TIPO_DE_AFIRMACION } from "./etiquetas"

interface MaterialParaWav {
  id: string
  autor_id: string
  rol: string
  motivo_fallo: string | null
  costo_estimado_usd: number | null
}

const dolares = (monto: number) =>
  `US$ ${monto.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** What only WAV needs about a material (D10), folded under "Detalle para WAV". Each line is unique: it is a key. */
export function lineasParaWav(material: MaterialParaWav, evidencia: Record<string, number>): string[] {
  const lineas = [`Papel: ${material.rol}`]
  const respaldo = Object.entries(evidencia)
    .sort(([claveA, a], [claveB, b]) => b - a || claveA.localeCompare(claveB))
    .map(([clave, cantidad]) => `${EVIDENCIA[clave] ?? clave} ${cantidad}`)
  if (respaldo.length > 0) lineas.push(`Evidencia: ${respaldo.join(" · ")}`)
  if (marcadoConMotivo(material.motivo_fallo)) {
    lineas.push(`Motivo: ${material.motivo_fallo.trim() === "" ? "sin detalle" : material.motivo_fallo}`)
  }
  if (material.costo_estimado_usd !== null) lineas.push(`Costo estimado: ${dolares(material.costo_estimado_usd)}`)
  lineas.push(`Material: ${material.id}`, `Autor: ${material.autor_id}`)
  return lineas
}

/** What only WAV needs about one idea, folded under it (4h, D8). The score arrives with Semana (batch 5). */
export function lineasDeIdeaParaWav(idea: { id: string; tipo: string; evidencia: string }): string[] {
  return [
    `Tipo de idea: ${TIPO_DE_AFIRMACION[idea.tipo] ?? idea.tipo}`,
    `Evidencia: ${EVIDENCIA[idea.evidencia] ?? idea.evidencia}`,
    `Idea: ${idea.id}`,
  ]
}
