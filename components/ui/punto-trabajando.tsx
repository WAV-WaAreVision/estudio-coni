import { cn } from "@/lib/utils"

/** The dot that pulses while something real is happening (v6 `.punto`). Still under reduced motion. */
export function PuntoTrabajando({ chico = false }: { chico?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-chico={chico || undefined}
      className={cn(
        "punto-trabajando inline-block shrink-0 rounded-full bg-current",
        chico ? "size-punto-chico" : "size-punto",
      )}
    />
  )
}
