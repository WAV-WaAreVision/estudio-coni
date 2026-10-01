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
    texto: "Falta configurar la app de Meta: avísale a Federico.",
  },
  fallo: {
    tipo: "error",
    titulo: "No pude terminar la conexión con Instagram.",
    texto: "Inténtalo de nuevo en unos minutos. Si sigue igual, avísale a Federico.",
  },
}

/** The outcome that `/api/meta/callback` leaves in the address, as a notice. Only the fixed words above are read. */
export function avisoDeInstagram(valor: string | undefined): AvisoDeInstagram | null {
  return valor !== undefined && Object.hasOwn(AVISOS, valor) ? (AVISOS[valor] ?? null) : null
}
