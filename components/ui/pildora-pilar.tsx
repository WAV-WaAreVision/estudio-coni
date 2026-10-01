import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

export function PildoraPilar({ pilar, className }: { pilar: Pilar; className?: string }) {
  return (
    <span
      data-pilar={pilar}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-pilar-tinte px-2.5 py-1.5",
        "text-label text-pilar-tinta before:size-[7px] before:rounded-full before:bg-pilar-punto before:content-['']",
        className,
      )}
    >
      {NOMBRE_DE_PILAR[pilar]}
    </span>
  )
}
