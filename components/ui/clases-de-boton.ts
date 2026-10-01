// Not a client module: Server Components use these classes too, for links that look like buttons.
import { cva } from "class-variance-authority"

/** Also used for links that look like buttons, so the two never drift apart. */
export const clasesDeBoton = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-md text-center text-label font-semibold",
    "transition-[transform,background-color,opacity] duration-150 ease-fuerte",
    "active:scale-[0.97] aria-disabled:active:scale-100 motion-reduce:transition-[background-color,opacity] motion-reduce:active:scale-100",
  ],
  {
    variants: {
      variante: {
        primario:
          "bg-acento text-sobre-acento hover:bg-acento-profundo aria-disabled:cursor-not-allowed aria-disabled:bg-hundido aria-disabled:text-apagado",
        linea:
          "border border-linea bg-superficie text-tinta aria-disabled:cursor-not-allowed aria-disabled:text-apagado",
        callado: "bg-transparent text-acento aria-disabled:cursor-not-allowed aria-disabled:text-apagado",
      },
      tamano: {
        grande: "min-h-13 w-full px-4.5 py-3.5 text-[1.0625rem]",
        chico: "min-h-11 px-3.5 py-2.5",
      },
    },
    defaultVariants: { variante: "primario", tamano: "grande" },
  },
)
