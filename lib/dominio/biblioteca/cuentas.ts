import { ideasSacadas } from "./palabras"

/** A count only when there is something to count (4i): "Procesando · 2", or just "Procesando". */
export const conCuenta = (texto: string, cantidad: number) => (cantidad > 0 ? `${texto} · ${cantidad}` : texto)

const plural = (cantidad: number, uno: string, varios: string) => `${cantidad} ${cantidad === 1 ? uno : varios}`

/** The parts that are not zero, joined; null when every count is zero, so the screen says why instead. */
function sinCeros(partes: readonly (string | null)[]): string | null {
  const quedan = partes.filter((parte): parte is string => parte !== null)
  return quedan.length === 0 ? null : quedan.join(" · ")
}

/** "3 materiales · 12 ideas sacadas", "1 material", or null. */
export function cuentasDeAutor({ materiales, ideas }: { materiales: number; ideas: number }): string | null {
  return sinCeros([
    materiales > 0 ? plural(materiales, "material", "materiales") : null,
    ideas > 0 ? ideasSacadas(ideas) : null,
  ])
}

/** "12 ideas sacadas · 3 autores", or null. */
export function cuentasDeTema({ ideas, autores }: { ideas: number; autores: number }): string | null {
  return sinCeros([ideas > 0 ? ideasSacadas(ideas) : null, autores > 0 ? plural(autores, "autor", "autores") : null])
}
