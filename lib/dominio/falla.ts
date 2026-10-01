/** Error whose message is written to be shown to Coni as-is (see FallaDeConfiguracion for WAV-only errors). */
export class Falla extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "Falla"
  }
}

/** Configuration error meant for WAV, not for Coni: callers log the message and show her a generic notice. */
export class FallaDeConfiguracion extends Falla {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "FallaDeConfiguracion"
  }
}
