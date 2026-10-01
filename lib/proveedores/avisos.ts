import { FallaDeConfiguracion } from "@/lib/dominio/falla"

/**
 * Where alerts go (design A9). Coni gets plain Spanish; WAV gets the technical detail. The tasks only see this port:
 * `notificadorResend` in production and `notificadorEnMemoria` in tests.
 */
export interface Notificador {
  /** `urgente` is an alert that goes out now; the rest can wait for the daily summary (08:30 America/Santiago). */
  aConi(mensaje: string, urgente: boolean): Promise<void>
  aWav(asunto: string, detalle: string): Promise<void>
}

export interface NotificadorEnMemoria extends Notificador {
  readonly aConiEnviados: { mensaje: string; urgente: boolean }[]
  readonly aWavEnviados: { asunto: string; detalle: string }[]
}

/** A test double that remembers what it was asked to send. */
export function notificadorEnMemoria(): NotificadorEnMemoria {
  const aConiEnviados: NotificadorEnMemoria["aConiEnviados"] = []
  const aWavEnviados: NotificadorEnMemoria["aWavEnviados"] = []
  return {
    aConiEnviados,
    aWavEnviados,
    async aConi(mensaje, urgente) {
      aConiEnviados.push({ mensaje, urgente })
    },
    async aWav(asunto, detalle) {
      aWavEnviados.push({ asunto, detalle })
    },
  }
}

/** The notifier the tasks use in production; Resend arrives with the failure hooks (Plan 4, task 3). */
export function avisosReales(): Notificador {
  throw new FallaDeConfiguracion("Los avisos por correo todavía no están conectados (Resend).")
}
