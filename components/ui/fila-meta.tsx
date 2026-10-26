import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * The meta row over a gate's title: the pillar on the left, format and length on the right. When the text grows it
 * stacks flush left (globals.css), never a right half hanging under the left one.
 */
export function FilaMeta({ pilar, largo, className }: { pilar: ReactNode; largo: ReactNode; className?: string }) {
  return (
    <p
      data-fila-meta
      className={cn(
        "fila-meta flex flex-wrap items-baseline justify-between gap-x-4 text-meta text-apagado",
        className,
      )}
    >
      <span>{pilar}</span>
      <span className="whitespace-nowrap">{largo}</span>
    </p>
  )
}
