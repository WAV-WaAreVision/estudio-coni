import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The custom scale of app/globals.css. Without it tailwind-merge reads `text-meta` as a colour and drops it next to
// `text-tinta` (spec 2026-10-16, decision 2). Keep these lists in step with the @theme block of globals.css.
const fusionar = extendTailwindMerge({
  extend: {
    theme: {
      text: ["pantalla", "pieza", "guion", "boton", "cuerpo", "meta", "insignia", "marca"],
      shadow: [
        "relieve",
        "relieve-alto",
        "relieve-fijo",
        "relieve-alto-fijo",
        "hundido",
        "relieve-pulgar",
        "relieve-perilla",
        "hundido-marcado",
      ],
      radius: ["control", "panel", "bloque", "barra", "toast", "casilla", "video"],
      spacing: [
        "objetivo",
        "boton",
        "fila",
        "fila-baja",
        "casilla",
        "pildora",
        "play",
        "nav",
        "foto",
        "riel",
        "interruptor-ancho",
        "interruptor-alto",
        "punto",
        "punto-chico",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return fusionar(clsx(inputs))
}
