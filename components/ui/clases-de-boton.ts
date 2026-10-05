// Not a client module: Server Components use these classes too, for links that look like buttons.
import { cva } from "class-variance-authority"

/** Brandkit 9.4: one principal per view, label on the left, icon on the right. Also used for links that look like buttons. */
export const clasesDeBoton = cva(
  [
    "inline-flex items-center gap-3 rounded-12 text-left text-cuerpo font-semibold",
    "transition-[transform,opacity] duration-[var(--dur-corta)] ease-salida active:scale-[0.98]",
    "aria-disabled:cursor-not-allowed aria-disabled:active:scale-100 motion-reduce:active:scale-100",
  ],
  {
    variants: {
      variante: {
        primario:
          "justify-between bg-principal px-4 text-sobre-principal [@media(hover:hover)]:hover:opacity-92 aria-disabled:bg-pista aria-disabled:text-apagado aria-disabled:hover:opacity-100",
        linea:
          "justify-between border border-campo px-4 text-tinta aria-disabled:border-linea aria-disabled:text-apagado",
        callado: "justify-start text-tinta aria-disabled:text-apagado",
        destructiva: "justify-start text-error aria-disabled:text-apagado",
      },
      tamano: {
        grande: "min-h-13 w-full",
        chico: "min-h-11",
      },
    },
    defaultVariants: { variante: "primario", tamano: "grande" },
  },
)
