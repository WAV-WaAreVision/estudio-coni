import { createHmac, randomBytes } from "node:crypto"

// "One click per visitor per day" without keeping who the visitor is. The address and the device go through a hash
// whose salt changes every day and is derived from a server secret: nothing about the visitor is stored, the salt is
// never stored with the click, and yesterday's hashes cannot be matched to today's.

/** The secret behind the daily salt. Without `SAL_DE_CLICS` each server instance makes its own, which only means a
 * visitor can be counted once per instance instead of once overall (it never links anyone). */
const SECRETO_DE_ESTA_INSTANCIA = randomBytes(32).toString("hex")

export function secretoDeClics(entorno: Record<string, string | undefined> = process.env): string {
  return entorno.SAL_DE_CLICS?.trim() || SECRETO_DE_ESTA_INSTANCIA
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
