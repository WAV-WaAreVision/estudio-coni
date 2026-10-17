import { BookOpenText } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@/lib/utils"
import { ICONO } from "./ui/icono"

/** Spec decision 7: the backing's source, its own quiet row. The icon only marks it; the text says it. */
export function LineaDeFuente({ texto, className }: { texto: string; className?: string }) {
  return (
    <p data-fuente className={cn("flex items-start gap-2 text-meta text-apagado", className)}>
      <BookOpenText aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{texto}</span>
    </p>
  )
}
