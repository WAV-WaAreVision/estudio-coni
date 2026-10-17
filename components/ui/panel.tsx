import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Decision 4: what she only reads sits flat on piedra-alta. Never a panel inside a panel. */
export function Panel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} data-contorno className={cn("rounded-panel bg-piedra-alta p-5", className)}>
      {children}
    </div>
  )
}
