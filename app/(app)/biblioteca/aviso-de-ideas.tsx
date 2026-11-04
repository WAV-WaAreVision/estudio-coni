import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { ID_DEL_AVISO_DE_IDEAS } from "@/lib/dominio/biblioteca/ideas"

/**
 * The quiet note after Ocultar or Mostrar. Always mounted, so it is announced when the note arrives and it keeps the
 * focus `BotonOcultar` gives it while the redraw takes the button away. Its parent's `gap-6` closes over it when empty.
 */
export function AvisoDeIdeas({ texto }: { texto: string | null }) {
  return (
    <div id={ID_DEL_AVISO_DE_IDEAS} tabIndex={-1} aria-live="polite" className="outline-none empty:-mt-6">
      {texto ? <LineaDeEstado tipo="neutro" titulo={texto} /> : null}
    </div>
  )
}
