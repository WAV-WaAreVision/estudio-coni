import { domingoDeSemana } from "@/lib/motor/semana"
import { correrMotor, type DepsDelMotor, type ResultadoDelMotor } from "@/lib/motor/semanal"

/** `semana` is the week «Proponer ahora» validated and keyed; without it the week comes from the clock. */
export type EntradaDelMotor = { timestamp?: Date; manual?: boolean; semana?: string }

export function semanaDeLaCorrida(entrada: EntradaDelMotor, ahora: Date): string {
  return entrada.semana ?? domingoDeSemana(entrada.timestamp ?? ahora)
}

/**
 * One run of the weekly task. Without Claude's key in the Vault there is nothing to do and nobody to alert: Coni has
 * not finished setting up, and the next Sunday asks again.
 */
export async function ejecutarMotorSemanal(
  entrada: EntradaDelMotor,
  depsMotor: () => Promise<DepsDelMotor | null>,
  ahora: () => Date = () => new Date(),
): Promise<ResultadoDelMotor | { omitido: true }> {
  const deps = await depsMotor()
  if (!deps) return { omitido: true }
  return correrMotor(deps, { semana: semanaDeLaCorrida(entrada, ahora()), manual: entrada.manual === true })
}
