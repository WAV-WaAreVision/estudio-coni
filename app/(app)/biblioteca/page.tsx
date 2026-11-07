import { UploadSimple } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import {
  contarPorEstado,
  leerNombreDeLoBorrado,
  leerPanelDelMaterial,
  listarAutores,
  listarMateriales,
} from "@/lib/datos/biblioteca"
import { ID_DEL_TITULO_DE_LA_LISTA, leerBorrado } from "@/lib/dominio/biblioteca/borrado"
import { AVISO_TRAS_SUBIR, RUTA_DE_SUBIR, vieneDeSubir } from "@/lib/dominio/biblioteca/borrador-de-subida"
import { REFRESCO_DE_LA_BIBLIOTECA_MS } from "@/lib/dominio/biblioteca/estado"
import { hayFiltros, leerFiltros, leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { exigirConi } from "@/lib/sesion/coni"
import { AvisoDeBorrado } from "./aviso-de-borrado"
import { FiltrosRapidos } from "./filtros-rapidos"
import { FocoDelPanel } from "./foco-del-panel"
import { MasFiltros } from "./mas-filtros"
import { NavDeBiblioteca } from "./nav-de-biblioteca"
import { PanelDeMaterial, PistaDelPanel } from "./panel-de-material"
import { TablaDeMateriales } from "./tabla-de-materiales"
import { TarjetaDeMaterial } from "./tarjeta-de-material"
import { TrasElAviso } from "./tras-el-aviso"

export default async function Materiales({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const filtros = leerFiltros(params)
  const seleccion = leerSeleccion(params)
  const borrado = leerBorrado(params)
  const [materiales, conteos, autores, panel, loBorrado] = await Promise.all([
    listarMateriales(db, filtros),
    contarPorEstado(db),
    listarAutores(db),
    seleccion ? leerPanelDelMaterial(db, seleccion) : null,
    borrado ? leerNombreDeLoBorrado(db, "material", borrado) : null,
  ])
  const ahora = Date.now()
  // One element, drawn in the header and again in the empty list: Subir is not a tab (spec section 1).
  const subir = (
    <Link
      href={RUTA_DE_SUBIR}
      className={clasesDeBoton({ variante: "secundario", tamano: "chico", className: "w-fit" })}
    >
      Subir
      <UploadSimple aria-hidden="true" size={ICONO.medio} />
    </Link>
  )

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      {/* While any material is really working (anywhere, not only in the filtered list), the list asks again. */}
      <RefrescoAutomatico activo={conteos.trabajando > 0} cadaMs={REFRESCO_DE_LA_BIBLIOTECA_MS} />
      {borrado ? <TrasElAviso parametro="aviso" tambien="id" /> : null}
      {/* Always drawn: its toast outlives the note leaving the address (plan D6). */}
      <AvisoDeBorrado
        tipo="material"
        borrado={borrado && loBorrado ? { id: borrado, nombre: loBorrado.nombre } : null}
      />
      <div className="grid min-w-0 gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 id={ID_DEL_TITULO_DE_LA_LISTA} tabIndex={-1} className="text-pantalla outline-none">
            Biblioteca
          </h1>
          {subir}
        </div>
        {vieneDeSubir(params) ? <LineaDeEstado tipo="neutro" titulo={AVISO_TRAS_SUBIR} /> : null}
        <NavDeBiblioteca actual="materiales" />
        <div className="flex flex-wrap items-start gap-2">
          <FiltrosRapidos filtros={filtros} conteos={conteos} />
          <MasFiltros filtros={filtros} autores={autores} />
        </div>
        {materiales.length === 0 ? (
          hayFiltros(filtros) ? (
            <p className="text-cuerpo text-apagado">Ningún material coincide con esos filtros.</p>
          ) : (
            <div className="grid justify-items-start gap-3">
              <p className="text-cuerpo text-apagado">Aún no hay material en la Biblioteca.</p>
              {subir}
            </div>
          )
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
      <aside
        aria-label="Material elegido"
        className="hidden md:sticky md:top-24 md:block md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
      >
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
