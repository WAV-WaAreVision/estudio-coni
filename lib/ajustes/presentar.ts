import type { EstadoDeCuenta, NombreDeCuenta } from "./estado"

export interface FilaDeCuenta {
  cuenta: NombreDeCuenta
  nombre: string
  /** What the row says about the account, in words: the colour is never the only signal. */
  estado: string
  tono: "ok" | "aviso" | "error" | "neutro"
}

const NOMBRE: Record<NombreDeCuenta, string> = {
  instagram: "Instagram",
  heygen: "HeyGen",
  elevenlabs: "ElevenLabs",
  anthropic: "Claude (Anthropic)",
}

const DIA_MS = 24 * 60 * 60 * 1000

/** One line of "Cuentas conectadas". */
export function filaDeCuenta(estado: EstadoDeCuenta, ahora: number): FilaDeCuenta {
  const base = { cuenta: estado.cuenta, nombre: NOMBRE[estado.cuenta] }
  switch (estado.estado) {
    case "lista":
      return { ...base, estado: "Conectada", tono: "ok" }
    case "falta":
      return { ...base, estado: "Falta", tono: "aviso" }
    case "vence": {
      const dias = Math.ceil((estado.expiraEn - ahora) / DIA_MS)
      return { ...base, estado: dias <= 1 ? "Vence mañana" : `Vence en ${dias} días`, tono: "aviso" }
    }
    case "vencida":
      return { ...base, estado: "Desconectada", tono: "error" }
    case "rechazada":
      return { ...base, estado: "No aceptó la llave", tono: "error" }
    case "sin_respuesta":
      return { ...base, estado: "Sin revisar", tono: "neutro" }
  }
}
