// The value is passed in, not read here: Next.js only inlines NEXT_PUBLIC_* variables in client
// bundles when the code spells out `process.env.NEXT_PUBLIC_X` literally.
export function exigirEnv(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}.`)
  }
  return valor
}
