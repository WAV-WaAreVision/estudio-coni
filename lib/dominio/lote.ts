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
