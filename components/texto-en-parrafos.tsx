import { parrafos } from "@/lib/transparencia/texto"
import { cn } from "@/lib/utils"

/** Coni's plain text as paragraphs. Every piece is a React text node, so markup is shown, never run. */
export function TextoEnParrafos({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn("grid gap-4", className)}>
      {parrafos(texto).map((parrafo, indice) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no identity of their own and never reorder
        <p key={indice} className="whitespace-pre-line">
          {parrafo}
        </p>
      ))}
    </div>
  )
}
