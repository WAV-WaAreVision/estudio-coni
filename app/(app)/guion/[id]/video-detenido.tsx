import { AvisarAFederico } from "@/components/avisar-a-federico"
import { Bloque } from "@/components/ui/bloque"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"
import { TEXTO_DETENIDO_EN_SUS_PALABRAS, TEXTO_VIDEO_DETENIDO } from "./textos"

/**
 * A signed video stopped with an explanation. When only WAV can fix it (`aviso`), «Avisar a Federico» sits in the
 * block (spec 2026-11-07, A11); a pause has none: WAV already knows.
 */
export function VideoDetenido({
  piezaId,
  explicacion,
  aviso,
}: {
  piezaId: string
  explicacion: string
  aviso: { avisado: boolean } | null
}) {
  return (
    <Bloque
      tipo="error"
      grande
      titulo={TEXTO_VIDEO_DETENIDO}
      accion={aviso ? <AvisarAFederico tipo="pieza" id={piezaId} avisado={aviso.avisado} /> : undefined}
    >
      <ExplicacionParaConi texto={explicacion} enSusPalabras={TEXTO_DETENIDO_EN_SUS_PALABRAS} />
    </Bloque>
  )
}
