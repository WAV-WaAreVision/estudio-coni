import { type AvisoDeInstagram, leerAviso } from "./instagram-aviso"

const AVISOS: Record<string, AvisoDeInstagram> = {
  conectada: { tipo: "ok", titulo: "LinkedIn quedó conectado." },
  cancelada: {
    tipo: "aviso",
    titulo: "Cancelaste la conexión con LinkedIn.",
    texto: "Cuando quieras, vuelve a intentarlo desde Cuentas conectadas.",
  },
  rechazada: {
    tipo: "error",
    titulo: "LinkedIn no aceptó la conexión.",
    texto: "Vuelve a conectarla desde Cuentas conectadas.",
  },
  permisos: {
    tipo: "error",
    titulo: "LinkedIn no dio permiso para publicar.",
    texto: "Vuelve a conectarlo y acepta todos los permisos.",
  },
  estado: {
    tipo: "error",
    titulo: "La conexión con LinkedIn venció antes de terminar.",
    texto: "Empieza de nuevo desde Cuentas conectadas.",
  },
  sin_app: {
    tipo: "error",
    titulo: "Todavía no está lista la conexión con LinkedIn.",
    texto: "Falta configurar la app de LinkedIn.",
  },
  fallo: {
    tipo: "error",
    titulo: "No pude terminar la conexión con LinkedIn.",
    texto: "Inténtalo de nuevo en unos minutos.",
  },
}

/** The outcome that `/api/linkedin/callback` leaves in the address. Only the fixed words above are read. */
export function avisoDeLinkedin(valor: string | undefined, avisado = false): AvisoDeInstagram | null {
  return leerAviso(AVISOS, valor, avisado)
}
