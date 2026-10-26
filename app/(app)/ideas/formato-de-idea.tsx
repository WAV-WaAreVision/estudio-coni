"use client"

import { Eleccion } from "@/components/ui/filas"

export type FormatoDePieza = "reel" | "carrusel"

/** Design 2026-10-26, D1 step 1: what the idea becomes. Choice rows of the design system, Reel first. */
export function FormatoDeIdea({
  elegido,
  alElegir,
}: {
  elegido: FormatoDePieza
  alElegir: (formato: FormatoDePieza) => void
}) {
  return (
    <fieldset className="elecciones grid">
      <legend className="mx-0.5 text-meta font-semibold">Formato</legend>
      <Eleccion
        nombre="formato-de-idea"
        valor="reel"
        elegido={elegido === "reel"}
        etiqueta="Reel"
        detalle="Con tu voz y tu avatar."
        alElegir={() => alElegir("reel")}
      />
      <Eleccion
        nombre="formato-de-idea"
        valor="carrusel"
        elegido={elegido === "carrusel"}
        etiqueta="Carrusel de LinkedIn"
        detalle="Láminas de texto firmadas por ti, solo para LinkedIn."
        alElegir={() => alElegir("carrusel")}
      />
    </fieldset>
  )
}
