import { cn } from "@/lib/utils"

/** "verificar dato" as the bank writes it, shown as a sentence-case label. */
export function etiquetaDeAlerta(tipo: string): string {
  return tipo.charAt(0).toUpperCase() + tipo.slice(1)
}

/** The alert travels with the idea into the script review, so it is named wherever the idea is shown. */
export function ChipDeAlerta({
  tipo,
  etiqueta,
  className,
}: {
  tipo: string
  /** Written as is (first letter up) instead of the type, for a badge whose text is the message itself. */
  etiqueta?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-label font-semibold",
        tipo === "nota" || tipo === "respaldo" ? "bg-hundido text-tinta" : "bg-aviso-fondo text-aviso-tinta",
        className,
      )}
    >
      {etiquetaDeAlerta(etiqueta ?? tipo)}
    </span>
  )
}
