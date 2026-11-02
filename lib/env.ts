/** Carries only the variable's name, so a caller can recognise a missing setting and log it without its value. */
export class FaltaVariableDeEntorno extends Error {
  constructor(readonly nombre: string) {
    super(`Falta la variable de entorno ${nombre}.`)
    this.name = "FaltaVariableDeEntorno"
  }
}

// The value is passed in, not read here: Next.js only inlines NEXT_PUBLIC_* variables in client
// bundles when the code spells out `process.env.NEXT_PUBLIC_X` literally.
export function exigirEnv(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new FaltaVariableDeEntorno(nombre)
  }
  return valor
}
