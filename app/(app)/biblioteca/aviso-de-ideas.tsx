import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { ID_DEL_AVISO_DE_IDEAS } from "@/lib/dominio/biblioteca/ideas"

/**
 * The quiet note after Ocultar or Mostrar. Always mounted, so it is announced when the note arrives and it keeps the
 * focus `BotonOcultar` gives it while the new screen takes the button away. It is the one live region: its line is
 * drawn without its own. Empty, it is out of the layout but focusable.
 */
export function AvisoDeIdeas({ texto }: { texto: string | null }) {
  return (
    <div
      id={ID_DEL_AVISO_DE_IDEAS}
      tabIndex={-1}
      aria-live="polite"
      aria-atomic="true"
      className="outline-none empty:sr-only"
    >
      {texto ? <LineaDeEstado tipo="neutro" titulo={texto} enVivo={false} /> : null}
    </div>
  )
}
