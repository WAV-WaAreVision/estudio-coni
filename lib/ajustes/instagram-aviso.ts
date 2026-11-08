import { TEXTO_LE_AVISE } from "@/lib/dominio/avisar-a-federico"

export interface AvisoDeInstagram {
  tipo: "ok" | "aviso" | "error"
  titulo: string
  texto?: string
}

const AVISOS: Record<string, AvisoDeInstagram> = {
  conectada: { tipo: "ok", titulo: "Instagram quedó conectado." },
  cancelada: {
    tipo: "aviso",
    titulo: "Cancelaste la conexión con Instagram.",
    texto: "Cuando quieras, vuelve a intentarlo desde Cuentas conectadas.",
  },
  rechazada: {
    tipo: "error",
    titulo: "Instagram no aceptó la conexión.",
    texto: "Vuelve a conectarla desde Cuentas conectadas.",
  },
  estado: {
    tipo: "error",
    titulo: "La conexión con Instagram venció antes de terminar.",
    texto: "Empieza de nuevo desde Cuentas conectadas.",
  },
  sin_app: {
    tipo: "error",
    titulo: "Todavía no está lista la conexión con Instagram.",
    texto: "Falta configurar la app de Meta.",
  },
  fallo: {
    tipo: "error",
    titulo: "No pude terminar la conexión con Instagram.",
    texto: "Inténtalo de nuevo en unos minutos.",
  },
}

/**
 * The two outcomes only WAV can fix (issue 111): the callback tells him itself, and the notice says so only when that
 * email went out. Otherwise `sin_app` asks her to come back later and `fallo` keeps its retry.
 */
export function leerAviso(
  avisos: Record<string, AvisoDeInstagram>,
  valor: string | undefined,
  avisado: boolean,
): AvisoDeInstagram | null {
  const aviso = valor !== undefined && Object.hasOwn(avisos, valor) ? (avisos[valor] ?? null) : null
  if (aviso === null || (valor !== "sin_app" && valor !== "fallo")) return aviso
  if (avisado) return { ...aviso, texto: `${aviso.texto} ${TEXTO_LE_AVISE}` }
  return valor === "sin_app" ? { ...aviso, texto: `${aviso.texto} Vuelve a intentarlo más tarde.` } : aviso
}

/** The outcome that `/api/meta/callback` leaves in the address, as a notice. Only the fixed words above are read. */
export function avisoDeInstagram(valor: string | undefined, avisado = false): AvisoDeInstagram | null {
  return leerAviso(AVISOS, valor, avisado)
}
