import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { Panel } from "@/components/ui/panel"
import { listarPilaresDeTemas } from "@/lib/datos/biblioteca"
import { leerTiposPreferidos, listarGanchos } from "@/lib/datos/ganchos"
import { leerTiposDeGancho } from "@/lib/datos/vocabulario"
import { ID_DEL_TITULO_DE_LA_LISTA } from "@/lib/dominio/biblioteca/borrado"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { filtrarGanchos, leerFiltrosDeGanchos, RUTA_DE_GANCHOS } from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import {
  opcionesDeFiltros,
  ordenarGanchos,
  SIN_COINCIDENCIAS,
  SIN_GANCHOS,
  tiposPreferidosActivos,
} from "@/lib/dominio/biblioteca/ganchos"
import { exigirConi } from "@/lib/sesion/coni"
import { FocoDelPanel } from "../foco-del-panel"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { ElegirMisTipos } from "./elegir-mis-tipos"
import { FiltrosDeGanchos } from "./filtros-de-ganchos"
import { ListaDeGanchos } from "./lista-de-ganchos"
import { MasFiltrosDeGanchos } from "./mas-filtros-de-ganchos"
import { PanelDeGancho } from "./panel-de-gancho"

/** The hooks library (spec 6b): every hook, filtered by the address, with the chosen one in the side panel. */
export default async function Ganchos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const [ganchos, tipos, preferidos, pilares] = await Promise.all([
    listarGanchos(db),
    leerTiposDeGancho(db),
    leerTiposPreferidos(db),
    listarPilaresDeTemas(db),
  ])
  const misTipos = tiposPreferidosActivos(preferidos, tipos)
  const filtros = leerFiltrosDeGanchos(params, { tipos, pilares, misTipos })
  const seleccion = leerSeleccion(params, "g")
  const visibles = ordenarGanchos(filtrarGanchos(ganchos, filtros, misTipos))
  // From the whole list, not the filtered one: a link to a hook keeps working whatever filters it carries.
  const elegido = seleccion ? (ganchos.find((gancho) => gancho.afirmacionId === seleccion) ?? null) : null

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      <div className="grid min-w-0 gap-5">
        <h1 id={ID_DEL_TITULO_DE_LA_LISTA} tabIndex={-1} className="text-pantalla outline-none">
          Biblioteca
        </h1>
        <NavDeBiblioteca actual="ganchos" />
        {ganchos.length === 0 ? (
          <p className="text-cuerpo text-apagado">{SIN_GANCHOS}</p>
        ) : (
          <>
            <FiltrosDeGanchos filtros={filtros} pilares={pilares} conMisTipos={misTipos.length > 0} />
            <div className="flex flex-wrap items-start gap-2">
              <MasFiltrosDeGanchos filtros={filtros} tipos={tipos} opciones={opcionesDeFiltros(ganchos)} />
              <ElegirMisTipos tipos={tipos} elegidos={preferidos} />
            </div>
            {visibles.length === 0 ? (
              <div className="grid justify-items-start gap-3">
                <p className="text-cuerpo text-apagado">{SIN_COINCIDENCIAS}</p>
                <Link href={RUTA_DE_GANCHOS} className={clasesDeBoton({ variante: "callado" })}>
                  Quitar los filtros
                </Link>
              </div>
            ) : (
              <ListaDeGanchos ganchos={visibles} tipos={tipos} filtros={filtros} seleccion={seleccion} />
            )}
          </>
        )}
      </div>
      <aside
        aria-label="Gancho elegido"
        className="hidden md:sticky md:top-24 md:block md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
      >
        {elegido ? (
          <PanelDeGancho gancho={elegido} tipos={tipos} filtros={filtros} />
        ) : (
          <Panel>
            <p className="text-cuerpo text-apagado">
              {seleccion
                ? "No encontré ese gancho. Elige otro de la tabla."
                : "Elige un gancho de la tabla para ver aquí sus partes, de dónde viene y marcarlo como favorito."}
            </p>
          </Panel>
        )}
      </aside>
    </div>
  )
}
