import { VENTANA_DESHACER_MS } from "@/lib/dominio/estados"

// Decisions 23 and 24: choosing or discarding several ideas at once.

/** In ten-thousandths of a dollar, the precision of `gastos`, so 37.8 + 2.2 is exactly 40. */
const enDiezmilesimos = (usd: number) => Math.round(usd * 10_000)

/** How many of `pedidas` scripts the month still covers: `reservar_gasto` refuses when `usado + estimado > tope`. */
export function cuantasAlcanzan(entrada: {
  tope: number
  usado: number
  estimadoPorGuion: number
  pedidas: number
}): number {
  const libre = enDiezmilesimos(entrada.tope) - enDiezmilesimos(entrada.usado)
  if (libre <= 0) return 0
  return Math.min(entrada.pedidas, Math.floor(libre / enDiezmilesimos(entrada.estimadoPorGuion)))
}

export function textoDeEmpezadas(cuantas: number): string {
  return cuantas === 1
    ? "Escribiendo 1 guion. Te aviso cuando esté."
    : `Escribiendo ${cuantas} guiones. Te aviso cuando estén.`
}

export function textoDeDescartadas(cuantas: number): string {
  return cuantas === 1 ? "Descarté 1 idea." : `Descarté ${cuantas} ideas.`
}

export function preguntaDeAlcance(cuantas: number): string {
  return cuantas === 1 ? "Alcanza para 1 este mes. ¿Hago ese?" : `Alcanza para ${cuantas} este mes. ¿Hago esos?`
}

export function botonDeAlcance(cuantas: number): string {
  return cuantas === 1 ? "Sí, hacer 1 guion" : `Sí, hacer ${cuantas} guiones`
}

export function textoDeRestauradas(vueltas: number, pedidas: number): string {
  if (vueltas === 0) return `Ya pasaron los ${VENTANA_DESHACER_MS / 1000} segundos: quedaron descartadas.`
  if (vueltas === pedidas) return vueltas === 1 ? "Volvió al banco." : "Volvieron al banco."
  return `Volvieron ${vueltas} de ${pedidas}. Las demás quedaron descartadas.`
}

export function detalleDeAlcance(cuantas: number): string {
  const primeras = cuantas === 1 ? "la primera" : `las primeras ${cuantas}`
  return `Hago ${primeras} que elegiste. El resto queda en el banco.`
}

/** What became of the ideas of a batch, by outcome (`InicioDeIdea` of lib/acciones/piezas.ts). */
export interface CuentaDelLote {
  empezadas: number
  devueltas: number
  conAviso: number
  noDisponibles: number
}

const DESTINOS: { clave: Exclude<keyof CuentaDelLote, "empezadas">; una: string; varias: string }[] = [
  { clave: "devueltas", una: "volvió al banco", varias: "volvieron al banco" },
  { clave: "conAviso", una: "quedó con un aviso en Inicio", varias: "quedaron con un aviso en Inicio" },
  { clave: "noDisponibles", una: "ya no estaba en el banco", varias: "ya no estaban en el banco" },
]

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

/** The truth after "Hacer los guiones (N)": how many started and what became of the rest. */
export function textoDelLote(cuenta: CuentaDelLote): string {
  const resto = DESTINOS.filter(({ clave }) => cuenta[clave] > 0)
  if (resto.length === 0) return textoDeEmpezadas(cuenta.empezadas)
  const cantidadDelResto = resto.reduce((suma, { clave }) => suma + cuenta[clave], 0)
  const cabeza =
    cuenta.empezadas > 0
      ? `Empecé ${cuenta.empezadas} de ${cuenta.empezadas + cantidadDelResto}.`
      : "No empecé ningún guion."
  const [solo] = resto
  if (resto.length === 1 && solo) {
    const verbo = cantidadDelResto === 1 ? solo.una : solo.varias
    if (cuenta.empezadas === 0) return `${cabeza} ${mayuscula(verbo)}.`
    const sujeto = cantidadDelResto === 1 ? "La otra" : `Las otras ${cantidadDelResto}`
    return `${cabeza} ${sujeto} ${verbo}.`
  }
  const partes = resto.map(({ clave, una, varias }) => `${cuenta[clave]} ${cuenta[clave] === 1 ? una : varias}`)
  return `${cabeza} ${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}.`
}
