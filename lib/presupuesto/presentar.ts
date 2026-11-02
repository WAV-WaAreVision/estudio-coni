import { dolares } from "@/lib/formato"

/** The most the cap goes in Ajustes › Presupuesto. */
export const MAXIMO_DEL_TOPE_USD = 500
/** Twice the largest cap: the default limit of the largest cap still fits. */
export const MAXIMO_DEL_LIMITE_USD = 2 * MAXIMO_DEL_TOPE_USD
/** Both steppers move in steps of US$ 5. */
export const PASO_DEL_PRESUPUESTO_USD = 5

/** D5: the limit is twice the cap unless Coni sets her own. */
export function limitePorDefecto(tope: number): number {
  return 2 * tope
}

export const PROVEEDORES = ["anthropic", "elevenlabs", "heygen", "voyage"] as const
export type Proveedor = (typeof PROVEEDORES)[number]

export function esProveedor(valor: string): valor is Proveedor {
  return (PROVEEDORES as readonly string[]).includes(valor)
}

/** The month as Ajustes › Presupuesto shows it (read by lib/presupuesto/leer.ts). */
export interface PresupuestoDelMes {
  tope: number
  /** Her limit for every month, or null for twice the cap. */
  limiteExplicito: number | null
  /** This month's brake (`limite_del_mes`). */
  limite: number
  /** True when she reactivated this month: its row wins over `limiteExplicito`. */
  reactivado: boolean
  usado: number
  porProveedor: Record<Proveedor, number>
  motor: { activo: boolean; usd: number }
  fusiones: { activas: boolean; usd: number }
  /** An unread notice of this month's limit, newer than the month's reactivation if there was one. */
  avisoSinLeer: boolean
  /** What one more script holds (`ESTIMADO_POR_GUION_USD`): without that room, new work is paused. */
  margenUsd: number
}

export interface Marca {
  etiqueta: string
  monto: string
  /** Where the tick goes on the bar, 0 to 100. */
  porcentaje: number
}

export interface VistaDelPresupuesto {
  linea: string
  usado: number
  /** The bar's full length in dollars: the limit, or the spend when it passed the limit. */
  escala: number
  relleno: number
  tono: "tinta" | "aviso" | "pasado"
  marcas: Marca[]
  pasado: string | null
  etiquetaDelLimite: string
  enElLimite: boolean
  textoEnElLimite: string
  propuestaDeReactivar: number
  reactivado: string | null
  porProveedor: { nombre: string; monto: string }[]
}

const NOMBRES: Record<Proveedor, string> = {
  anthropic: "Claude",
  elevenlabs: "ElevenLabs",
  heygen: "HeyGen",
  voyage: "Voyage",
}

const dosDecimales = (valor: number) => Math.round(valor * 100) / 100

/**
 * Spec 2026-11-02, Screens: the bar against the cap with marks at 50, 80 and 100 percent of the cap and at the limit;
 * ink below 80 percent, the warning icon from 80 percent, the error fill past the cap (the raspberry is for signing).
 */
export function presentarPresupuesto(p: PresupuestoDelMes): VistaDelPresupuesto {
  const escala = Math.max(p.limite, p.tope, p.usado)
  const parte = (usd: number) => (escala > 0 ? dosDecimales(Math.min(100, (usd / escala) * 100)) : 0)
  const marca = (etiqueta: string, usd: number): Marca => ({ etiqueta, monto: dolares(usd), porcentaje: parte(usd) })
  const usadoVisible = dosDecimales(p.usado)
  const pasoElTope = usadoVisible > p.tope
  const tono = pasoElTope ? "pasado" : p.tope > 0 && usadoVisible >= 0.8 * p.tope ? "aviso" : "tinta"
  return {
    linea: `Llevas ${dolares(p.usado)} de tu tope de ${dolares(p.tope)} este mes`,
    usado: p.usado,
    escala,
    relleno: parte(p.usado),
    tono,
    marcas: [
      marca("50 % del tope", 0.5 * p.tope),
      marca("80 % del tope", 0.8 * p.tope),
      ...(p.limite === p.tope ? [marca("Tope y límite", p.tope)] : [marca("Tope", p.tope), marca("Límite", p.limite)]),
    ],
    pasado: pasoElTope ? `Pasaste tu tope. La app sigue hasta tu límite de ${dolares(p.limite)}.` : null,
    etiquetaDelLimite:
      p.limiteExplicito === null ? `US$ ${limitePorDefecto(p.tope)} (el doble del tope)` : `US$ ${p.limiteExplicito}`,
    enElLimite: p.usado + p.margenUsd > p.limite || p.avisoSinLeer,
    textoEnElLimite: `Llegaste a tu límite de ${dolares(p.limite)}. Lo nuevo quedó en pausa; lo que ya firmaste sigue.`,
    propuestaDeReactivar: p.limite + p.tope,
    reactivado: p.reactivado ? `Este mes tu límite es ${dolares(p.limite)} porque lo reactivaste.` : null,
    porProveedor: PROVEEDORES.map((proveedor) => ({
      nombre: NOMBRES[proveedor],
      monto: dolares(p.porProveedor[proveedor]),
    })),
  }
}

/**
 * The row of Ajustes: «Presupuesto · US$ 31 de 40». Rounded down under the cap and up past it, so the row never
 * reads «40 de 40» once the month went over.
 */
export function filaDePresupuesto(usado: number, tope: number): string {
  const visible = dosDecimales(usado)
  const entero = visible > tope ? Math.ceil(visible) : Math.floor(visible)
  return `Presupuesto · US$ ${entero} de ${Math.round(tope)}`
}
