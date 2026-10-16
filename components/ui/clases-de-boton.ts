// Not a client module: Server Components use these classes too, for links that look like buttons.
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const PLANO_SI_ESTA_DESHABILITADO =
  "aria-disabled:bg-piedra-honda aria-disabled:text-apagado aria-disabled:shadow-none aria-disabled:active:shadow-none"

/**
 * Decision 4: everything touchable is a raised pill, and pressing sinks it (no scale). One primary per view, label on
 * the left, icon on the right. The destructive variant is only the confirm inside a confirmation.
 */
const variantesDeBoton = cva(
  [
    "inline-flex items-center gap-3 rounded-control text-left font-semibold",
    "transition-[box-shadow,opacity] duration-[var(--dur-corta)] ease-salida",
    "aria-disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variante: {
        primario: `justify-between bg-tinta text-luz shadow-relieve active:shadow-hundido ${PLANO_SI_ESTA_DESHABILITADO}`,
        secundario: `justify-between bg-piedra text-tinta shadow-relieve active:shadow-hundido ${PLANO_SI_ESTA_DESHABILITADO}`,
        callado:
          "justify-start text-tinta underline decoration-1 underline-offset-4 active:opacity-70 aria-disabled:text-apagado aria-disabled:no-underline",
        destructiva: `justify-start bg-piedra text-error shadow-relieve active:shadow-hundido ${PLANO_SI_ESTA_DESHABILITADO}`,
      },
      tamano: {
        grande: "min-h-boton w-full px-[22px] text-boton",
        chico: "min-h-objetivo px-[18px] text-cuerpo",
      },
    },
    // The quiet action has no surface at any size: its target is the 2.75rem row of its text.
    compoundVariants: [{ variante: "callado", class: "min-h-objetivo w-auto px-0 text-cuerpo" }],
    defaultVariants: { variante: "primario", tamano: "grande" },
  },
)

export type OpcionesDeBoton = VariantProps<typeof variantesDeBoton>

/** The classes merged with `cn`, so the compound variant wins over the size it overrides. */
export function clasesDeBoton({ className, ...opciones }: OpcionesDeBoton & { className?: string } = {}): string {
  return cn(variantesDeBoton(opciones), className)
}
