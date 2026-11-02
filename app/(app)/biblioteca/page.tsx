import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Panel } from "@/components/ui/panel"
import { contarPorEstado, leerPanelDelMaterial, listarAutores, listarMateriales } from "@/lib/datos/biblioteca"
import { estaProcesando } from "@/lib/dominio/biblioteca/estado"
import { hayFiltros, leerFiltros, leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { exigirConi } from "@/lib/sesion/coni"
import { FiltrosRapidos } from "./filtros-rapidos"
import { FocoDelPanel } from "./foco-del-panel"
import { MasFiltros } from "./mas-filtros"
import { NavDeBiblioteca } from "./nav-de-biblioteca"
import { PanelDeMaterial, PistaDelPanel } from "./panel-de-material"
import { TablaDeMateriales } from "./tabla-de-materiales"
import { TarjetaDeMaterial } from "./tarjeta-de-material"

/** While anything is really processing, the list asks the server again every 10 s. */
const REFRESCO_MS = 10_000

export default async function Materiales({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const filtros = leerFiltros(params)
  const seleccion = leerSeleccion(params)
  const [materiales, conteos, autores, panel] = await Promise.all([
    listarMateriales(db, filtros),
    contarPorEstado(db),
    listarAutores(db),
    seleccion ? leerPanelDelMaterial(db, seleccion) : null,
  ])
  const ahora = Date.now()

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      <RefrescoAutomatico activo={materiales.some(estaProcesando)} cadaMs={REFRESCO_MS} />
      <div className="grid min-w-0 gap-5">
        <h1 className="text-pantalla">Biblioteca</h1>
        <NavDeBiblioteca actual="materiales" />
        <FiltrosRapidos filtros={filtros} conteos={conteos} />
        <MasFiltros filtros={filtros} autores={autores} />
        {materiales.length === 0 ? (
          <p className="text-cuerpo text-apagado">
            {hayFiltros(filtros)
              ? "Ningún material coincide con esos filtros."
              : "Aún no hay material en la Biblioteca."}
          </p>
        ) : (
          <>
            <ul aria-label="Materiales" className="grid gap-3 md:hidden">
              {materiales.map((material) => (
                <TarjetaDeMaterial key={material.id} material={material} ahora={ahora} />
              ))}
            </ul>
            <div className="hidden md:block">
              <TablaDeMateriales materiales={materiales} filtros={filtros} seleccion={seleccion} ahora={ahora} />
            </div>
          </>
        )}
      </div>
      <aside aria-label="Material elegido" className="hidden md:sticky md:top-24 md:block">
        {panel ? (
          <PanelDeMaterial panel={panel} filtros={filtros} ahora={ahora} />
        ) : seleccion ? (
          <Panel>
            <p className="text-cuerpo text-apagado">No encontré ese material. Elige otro de la tabla.</p>
          </Panel>
        ) : (
          <PistaDelPanel />
        )}
      </aside>
    </div>
  )
}
