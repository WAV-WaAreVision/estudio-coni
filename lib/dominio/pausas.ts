import { Falla } from "@/lib/dominio/falla"

/** The paid providers whose payment, quota or key failures pause their work (spec 2026-11-07, decision 1). */
export const PROVEEDORES_CON_PAUSA = ["elevenlabs", "heygen", "claude", "voyage"] as const
export type ProveedorConPausa = (typeof PROVEEDORES_CON_PAUSA)[number]

export const MOTIVOS_DE_PAUSA = ["pago", "cuota", "llave"] as const
export type MotivoDePausa = (typeof MOTIVOS_DE_PAUSA)[number]

export function esProveedorConPausa(valor: string): valor is ProveedorConPausa {
  return (PROVEEDORES_CON_PAUSA as readonly string[]).includes(valor)
}

export function esMotivoDePausa(valor: string): valor is MotivoDePausa {
  return (MOTIVOS_DE_PAUSA as readonly string[]).includes(valor)
}

/** What the piece or the screen says while the provider is paused (decision 3). The screens match on these exact texts. */
export const TEXTO_PAUSA: Record<ProveedorConPausa, string> = {
  elevenlabs: "Tu voz está en pausa. Ya le avisamos a WAV.",
  heygen: "Tu video está en pausa. Ya le avisamos a WAV.",
  claude: "Las ideas y los guiones están en pausa. Ya le avisamos a WAV.",
  voyage: "La Biblioteca está en pausa. Ya le avisamos a WAV.",
}

/** Coni's one notice when the pause closes (decision 5). */
export const TEXTO_PAUSA_CERRADA: Record<ProveedorConPausa, string> = {
  elevenlabs: "Ya puedes preparar tu voz de nuevo.",
  heygen: "Ya puedes grabar tus videos de nuevo.",
  claude: "Las ideas y los guiones funcionan de nuevo.",
  voyage: "La Biblioteca funciona de nuevo.",
}

/** A material meets several providers (amendment A6): a pause met while processing it says the Biblioteca text. */
export const TEXTO_PAUSA_DE_BIBLIOTECA = TEXTO_PAUSA.voyage

const LARGO_DEL_DETALLE = 400

/**
 * A provider refused for payment, quota or key: retrying does not help and WAV owns the fix. The message is Coni's
 * text; `detalle` is WAV's (already redacted by the client that built it).
 */
export class PausaDeProveedor extends Falla {
  readonly detalle: string
  constructor(
    readonly proveedor: ProveedorConPausa,
    readonly motivo: MotivoDePausa,
    detalle: string,
    /** The status the provider answered; null when the pause comes from a finished job (a failed render). */
    readonly http: number | null,
  ) {
    super(TEXTO_PAUSA[proveedor])
    this.name = "PausaDeProveedor"
    this.detalle = detalle.slice(0, LARGO_DEL_DETALLE)
  }
}

const SUJETO_EN_INICIO: Record<Exclude<ProveedorConPausa, "voyage">, string> = {
  elevenlabs: "La voz está en pausa",
  heygen: "Los videos están en pausa",
  claude: "Las ideas y los guiones están en pausa",
}

const NOMBRE_EN_INICIO: Record<Exclude<ProveedorConPausa, "voyage">, string> = {
  elevenlabs: "ElevenLabs",
  heygen: "HeyGen",
  claude: "Claude",
}

function causaEnInicio(proveedor: Exclude<ProveedorConPausa, "voyage">, motivo: MotivoDePausa): string {
  const nombre = NOMBRE_EN_INICIO[proveedor]
  switch (motivo) {
    case "pago":
      return `la cuenta de ${nombre} tiene un pago pendiente`
    case "cuota":
      return `la cuenta de ${nombre} se quedó sin ${proveedor === "heygen" ? "créditos" : "saldo"}`
    case "llave":
      return `la clave de ${nombre} dejó de funcionar`
  }
}

/** Inicio's «Atención» line of an open pause (spec amendment A10); Voyage has none (A6). */
export function lineaDePausaDeInicio(proveedor: ProveedorConPausa, motivo: MotivoDePausa): string | null {
  if (proveedor === "voyage") return null
  return `${SUJETO_EN_INICIO[proveedor]}: ${causaEnInicio(proveedor, motivo)}. WAV ya lo está resolviendo.`
}

/**
 * The provider whose pause text this is, or null: a piece keeps the text after the pause closes. The Biblioteca text
 * answers null: a Claude pause or ElevenLabs while transcribing writes it, and Voyage writes no text (amendment A6), so
 * screens read it with `textoDePausaDeBiblioteca`.
 */
export function proveedorDelTextoDePausa(texto: string | null): ProveedorConPausa | null {
  if (texto === null || texto === TEXTO_PAUSA_DE_BIBLIOTECA) return null
  return PROVEEDORES_CON_PAUSA.find((proveedor) => TEXTO_PAUSA[proveedor] === texto) ?? null
}

export function esTextoDePausa(texto: string | null): boolean {
  return proveedorDelTextoDePausa(texto) !== null || texto === TEXTO_PAUSA_DE_BIBLIOTECA
}

export function textoDePausa(abiertas: readonly ProveedorConPausa[], proveedor: ProveedorConPausa): string | null {
  return abiertas.includes(proveedor) ? TEXTO_PAUSA[proveedor] : null
}

/**
 * The Biblioteca's buttons close only for Claude (amendment A6): a Voyage pause leaves the embeddings to maintenance
 * and disables nothing for Coni.
 */
export function textoDePausaDeBiblioteca(abiertas: readonly ProveedorConPausa[]): string | null {
  return abiertas.includes("claude") ? TEXTO_PAUSA_DE_BIBLIOTECA : null
}

/** What a maintainer or a log must read: a pause's technical detail, never Coni's text. */
export function mensajeTecnico(error: unknown): string {
  if (error instanceof PausaDeProveedor) return error.detalle
  return error instanceof Error ? error.message : String(error)
}

/**
 * The reason a failed piece shows next to its disabled «Reintentar»: nothing while its own pause is open (the line
 * under the button says it, once), the generic line once that pause closed (the stored text is stale), and any other
 * reason as it is.
 */
export function explicacionAnteLaPausa(
  explicacion: string | null,
  pausaAbierta: string | null,
  generico: string,
): string | null {
  if (explicacion !== null && esTextoDePausa(explicacion)) return pausaAbierta === explicacion ? null : generico
  return explicacion ?? generico
}
