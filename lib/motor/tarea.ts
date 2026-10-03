import { semanaDe } from "@/lib/motor/semana"
import { correrMotor, type DepsDelMotor, type ResultadoDelMotor } from "@/lib/motor/semanal"

export type EntradaDelMotor = { timestamp?: Date; manual?: boolean }

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
  return correrMotor(deps, { semana: semanaDe(entrada.timestamp ?? ahora()), manual: entrada.manual === true })
}
