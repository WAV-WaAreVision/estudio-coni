import { ETIQUETAS_DE_TONO } from "@/lib/dominio/etiquetas"

export const AYUDA_DE_MARCAS = "Lo que va entre corchetes marca el tono de la voz. No se lee ni sale en los subtítulos."

/** Under the script: what the brackets do, and the list the "no la conozco" warning points to. */
export function AyudaDeMarcas() {
  return (
    <div className="grid gap-0.5 text-meta text-apagado">
      <p>{AYUDA_DE_MARCAS}</p>
      <p>Marcas que conozco: {ETIQUETAS_DE_TONO.map((etiqueta) => `[${etiqueta}]`).join(" ")}</p>
    </div>
  )
}
