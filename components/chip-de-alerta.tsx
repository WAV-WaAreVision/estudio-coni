import { cn } from "@/lib/utils"

/** "verificar dato" as the bank writes it, shown as a sentence-case label. */
export function etiquetaDeAlerta(tipo: string): string {
  return tipo.charAt(0).toUpperCase() + tipo.slice(1)
}

/** The alert travels with the idea into the script review, so it is named wherever the idea is shown. */
export function ChipDeAlerta({ tipo, className }: { tipo: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-label font-semibold",
        tipo === "nota" ? "bg-hundido text-tinta" : "bg-aviso-fondo text-aviso-tinta",
        className,
      )}
    >
      {etiquetaDeAlerta(tipo)}
    </span>
  )
}
