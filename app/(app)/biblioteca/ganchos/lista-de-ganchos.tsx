import type { FiltrosDeGanchos } from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import type { GanchoDeLista, TipoDeGancho } from "@/lib/dominio/biblioteca/ganchos"
import { TablaDeGanchos } from "./tabla-de-ganchos"
import { TarjetaDeGancho } from "./tarjeta-de-gancho"

/** Cards on the phone; the table from md, as Autores. */
export function ListaDeGanchos({
  ganchos,
  tipos,
  filtros,
  seleccion,
}: {
  ganchos: GanchoDeLista[]
  tipos: readonly TipoDeGancho[]
  filtros: FiltrosDeGanchos
  seleccion: string | null
}) {
  return (
    <>
      <ul aria-label="Ganchos" className="grid gap-3 md:hidden">
        {ganchos.map((gancho) => (
          <TarjetaDeGancho key={gancho.afirmacionId} gancho={gancho} tipos={tipos} />
        ))}
      </ul>
      <div className="hidden md:block">
        <TablaDeGanchos ganchos={ganchos} tipos={tipos} filtros={filtros} seleccion={seleccion} />
      </div>
    </>
  )
}
