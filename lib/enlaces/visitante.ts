import { createHmac, randomBytes } from "node:crypto"

// "One click per visitor per day" without keeping who the visitor is. The address and the device go through a hash
// whose salt changes every day and is derived from a server secret: nothing about the visitor is stored, the salt is
// never stored with the click, and yesterday's hashes cannot be matched to today's.

/** A throwaway secret for development only: one per process, so the dedupe can be tried without configuring anything. */
const SECRETO_DE_DESARROLLO = randomBytes(32).toString("hex")

/**
 * The secret behind the daily salt: `SAL_DE_CLICS`. In production without it there is none (null) and nothing is
 * counted: a secret made per server instance would hash the same visitor differently on each instance, and the count
 * would grow with the traffic of the servers instead of the people.
 */
export function secretoDeClics(entorno: Record<string, string | undefined> = process.env): string | null {
  const configurado = entorno.SAL_DE_CLICS?.trim()
  if (configurado) return configurado
  return entorno.NODE_ENV === "production" ? null : SECRETO_DE_DESARROLLO
}

/** The salt of one day: a keyed hash of the day, recomputable by the server and by nobody else. */
export function salDelDia(secreto: string, dia: string): string {
  return createHmac("sha256", secreto).update(`sal:${dia}`).digest("hex")
}

/** Hash of the visitor for that day. The day's salt keys the hash, so the digest cannot be reversed to an address. */
export function huellaDeVisitante(entrada: { secreto: string; dia: string; ip: string; agente: string }): string {
  return createHmac("sha256", salDelDia(entrada.secreto, entrada.dia))
    .update(`${entrada.ip}\n${entrada.agente}`)
    .digest("hex")
}

/** The client's address as the platform reports it. It is hashed at once and never logged or stored. */
export function ipDeLaSolicitud(cabeceras: Headers): string {
  const reenviada = cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim()
  return reenviada || cabeceras.get("x-real-ip")?.trim() || ""
}
