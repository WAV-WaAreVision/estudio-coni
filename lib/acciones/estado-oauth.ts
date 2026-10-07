import { randomBytes, timingSafeEqual } from "node:crypto"

/** A one-use value that goes out with the redirect and must come back: it proves that she started the connection. */
export function nuevoEstado(): string {
  return randomBytes(32).toString("hex")
}

export function estadoCoincide(guardado: string | null | undefined, recibido: string | null | undefined): boolean {
  if (!guardado || !recibido) return false
  const a = Buffer.from(guardado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}
