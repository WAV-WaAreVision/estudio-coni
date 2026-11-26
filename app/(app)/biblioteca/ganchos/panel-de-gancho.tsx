import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { type FiltrosDeGanchos, hrefDeGanchos } from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import type { GanchoDeLista, TipoDeGancho } from "@/lib/dominio/biblioteca/ganchos"
import { BotonFavorito } from "./boton-favorito"
import { DetalleDeGancho } from "./detalle-de-gancho"

/** The computer's side panel of a hook, built from the list already read. Closing keeps her filters. */
export function PanelDeGancho({
  gancho,
  tipos,
  filtros,
}: {
  gancho: GanchoDeLista
  tipos: readonly TipoDeGancho[]
  filtros: FiltrosDeGanchos
}) {
  return (
    <section aria-labelledby="panel-titulo" className="grid gap-6 rounded-panel bg-piedra-alta p-5">
      <h2 id="panel-titulo" tabIndex={-1} className="text-pieza text-balance">
        {`«${gancho.fraseExacta}»`}
      </h2>
      <DetalleDeGancho gancho={gancho} tipos={tipos} />
      <BotonFavorito afirmacionId={gancho.afirmacionId} favorito={gancho.favorito} />
      <Link
        href={hrefDeGanchos(filtros)}
        scroll={false}
        data-cierra-panel={gancho.afirmacionId}
        className={clasesDeBoton({ variante: "callado" })}
      >
        Cerrar el panel
      </Link>
    </section>
  )
}
