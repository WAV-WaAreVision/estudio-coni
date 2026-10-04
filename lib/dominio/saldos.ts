// lib/dominio/saldos.ts
import { dolares } from "@/lib/formato"

/** What ElevenLabs says about Coni's characters (`GET /v1/user/subscription`). */
export type SaldoElevenlabs =
  | { ok: true; usados: number; limite: number; renuevaEn: string | null; puedeExceder: boolean }
  | { ok: false; motivo: string }

/** What HeyGen says about the API wallet (`GET /v3/users/me`). The plan's credits do not fund API renders. */
export type SaldoHeygen =
  | { ok: true; tipo: "billetera"; moneda: "usd" | "creditos"; saldo: number }
  | { ok: true; tipo: "sin_billetera"; facturacion: string }
  | { ok: false; motivo: string }

export interface Saldos {
  elevenlabs: SaldoElevenlabs
  heygen: SaldoHeygen
}

/** A failed lookup is `no_se_sabe`, which never blocks a button. */
export type Alcance = { tipo: "alcanza" } | { tipo: "no_alcanza"; mensaje: string } | { tipo: "no_se_sabe" }

const miles = (cantidad: number) => Math.round(cantidad).toLocaleString("es-CL")

function caracteresQuedan(saldo: Extract<SaldoElevenlabs, { ok: true }>): number {
  return Math.max(0, saldo.limite - saldo.usados)
}

export function alcanceDeVoz(saldo: SaldoElevenlabs, caracteres: number): Alcance {
  if (!saldo.ok) return { tipo: "no_se_sabe" }
  const quedan = caracteresQuedan(saldo)
  if (quedan >= caracteres || saldo.puedeExceder) return { tipo: "alcanza" }
  return {
    tipo: "no_alcanza",
    mensaje: `No te alcanzan los caracteres de ElevenLabs (te quedan ${miles(quedan)} y esta voz usa ${miles(caracteres)}). Recarga o mejora tu plan en elevenlabs.io, en Suscripción.`,
  }
}

export function alcanceDeVideo(saldo: SaldoHeygen, costo: { usd: number; creditos: number }): Alcance {
  if (!saldo.ok || saldo.tipo !== "billetera") return { tipo: "no_se_sabe" }
  const enDolares = saldo.moneda === "usd"
  if (saldo.saldo >= (enDolares ? costo.usd : costo.creditos)) return { tipo: "alcanza" }
  const quedan = enDolares ? dolares(saldo.saldo) : `${miles(saldo.saldo)} créditos`
  const cuesta = enDolares ? `unos ${dolares(costo.usd)}` : `unos ${miles(costo.creditos)} créditos`
  return {
    tipo: "no_alcanza",
    mensaje: `Tu saldo de API de HeyGen no alcanza (te quedan ${quedan} y este video cuesta ${cuesta}). Recárgalo en app.heygen.com, en la sección API. Los créditos de tu plan de HeyGen no sirven para grabar desde Conidolly.`,
  }
}

export function lineaDeSaldoVoz(saldo: SaldoElevenlabs, zona: string): string {
  if (!saldo.ok) return "No pude ver tu saldo de ElevenLabs."
  const base = `ElevenLabs: te quedan ${miles(caracteresQuedan(saldo))} de ${miles(saldo.limite)} caracteres.`
  if (saldo.renuevaEn === null) return base
  const dia = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", timeZone: zona }).format(
    new Date(saldo.renuevaEn),
  )
  return `${base} Se renuevan el ${dia}.`
}

export function lineaDeSaldoVideo(saldo: SaldoHeygen): string {
  if (!saldo.ok) return "No pude ver tu saldo de API de HeyGen."
  if (saldo.tipo === "sin_billetera") return "HeyGen no informa un saldo de API para tu llave."
  const monto = saldo.moneda === "usd" ? dolares(saldo.saldo) : `${miles(saldo.saldo)} créditos`
  return `Saldo de API de HeyGen: ${monto}. Es aparte de tu plan de HeyGen.`
}

export function lineaDeCostoVoz(caracteres: number, usd: number): string {
  return `Grabar voz: ~${miles(caracteres)} caracteres (${dolares(usd)})`
}

export function lineaDeCostoVideo(segundos: number, usd: number, incluyeVoz: boolean): string {
  return `Grabar video: ~${Math.round(segundos)} s (${dolares(usd)})${incluyeVoz ? " · incluye la voz" : ""}`
}
