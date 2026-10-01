/** Error whose message is written to be shown to Coni as-is. */
export class Falla extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "Falla"
  }
}
