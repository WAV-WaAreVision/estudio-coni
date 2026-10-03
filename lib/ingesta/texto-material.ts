import type { Parte } from "@/lib/ingesta/partes"

function esDeVideo(parte: Parte): parte is Parte & { ubicacion: { segundo: number; pista: "voz" | "pantalla" } } {
  return "segundo" in parte.ubicacion
}

function reloj(segundos: number): string {
  const total = Math.floor(segundos)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

function unaLinea(texto: string): string {
  return texto.replace(/\s+/g, " ").trim()
}

function etiqueta(parte: Parte): string {
  const { ubicacion } = parte
  if ("segundo" in ubicacion)
    return `[${reloj(ubicacion.segundo)} ${ubicacion.pista === "voz" ? "habla" : "pantalla"}] `
  if ("imagen" in ubicacion) return `[imagen ${ubicacion.imagen}] `
  return ubicacion.pagina === null ? "" : `[página ${ubicacion.pagina}] `
}

/** By the second the label shows; voice before screen within one second. Every other order is the order of the parts. */
function enOrdenDeTiempo(partes: readonly Parte[]): Parte[] {
  if (!partes.every(esDeVideo)) return [...partes]
  return [...partes].sort(
    (a, b) =>
      Math.floor(a.ubicacion.segundo) - Math.floor(b.ubicacion.segundo) ||
      Number(a.ubicacion.pista === "pantalla") - Number(b.ubicacion.pista === "pantalla"),
  )
}

/**
 * The stored text of a material: what Coni reads and what the card is written from. A video keeps its two tracks on
 * the same clock (`[0:12 habla]`, `[0:12 pantalla]`), images keep their number and PDF pages their page.
 */
export function renderizarPartes(partes: readonly Parte[]): string {
  const ordenadas = enOrdenDeTiempo(partes)
  return ordenadas
    .map((parte, i) => {
      const linea = esDeVideo(parte) || "imagen" in parte.ubicacion ? unaLinea(parte.texto) : parte.texto
      const separador = i === 0 ? "" : esDeVideo(parte) || "imagen" in parte.ubicacion ? "\n" : "\n\n"
      return `${separador}${etiqueta(parte)}${linea}`
    })
    .join("")
}
