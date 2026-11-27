import { Volver } from "@/components/ui/volver"
import { leerRevisionDeEtiquetas } from "@/lib/datos/lote-de-etiquetas"
import { progresoDeLote, TEXTOS_DE_REVISION } from "@/lib/dominio/biblioteca/lote-de-etiquetas"
import { exigirConi } from "@/lib/sesion/coni"
import { TarjetaDeEtiquetaDudosa } from "./tarjeta-de-etiqueta"

/**
 * Spec 6c-2: the week's doubtful tags, five at most, in their order. Two columns from 1024 px (the Biblioteca uses the
 * width on a computer), one on a phone and a tablet. Coni only, like every Biblioteca page (Ajustes a la spec, 1).
 */
export default async function RevisarEtiquetas() {
  const { db } = await exigirConi()
  const revision = await leerRevisionDeEtiquetas(db)
  const items = revision.estado === "lista" ? revision.items : []
  const tarjetas = revision.estado === "lista" ? revision.tarjetas : []
  const aviso =
    revision.estado === "error"
      ? TEXTOS_DE_REVISION.error
      : items.length === 0
        ? TEXTOS_DE_REVISION.vacio
        : tarjetas.every((tarjeta) => tarjeta.estado === "hecha")
          ? TEXTOS_DE_REVISION.listo
          : null
  return (
    <div className="grid gap-6">
      <Volver href="/">Inicio</Volver>
      <header className="grid gap-1.5">
        <h1 className="text-pantalla">{TEXTOS_DE_REVISION.titulo}</h1>
        {tarjetas.length > 0 ? <p className="text-meta text-apagado">{progresoDeLote(tarjetas)}</p> : null}
      </header>
      {aviso ? <p className="text-cuerpo text-apagado">{aviso}</p> : null}
      {tarjetas.length > 0 ? (
        <ol className="grid gap-3 lg:grid-cols-2">
          {tarjetas.map((tarjeta) => (
            // Keyed by its state too: a card that became done remounts and drops an editor left open.
            <li key={`${tarjeta.posicion}-${tarjeta.estado}`}>
              <TarjetaDeEtiquetaDudosa tarjeta={tarjeta} />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
