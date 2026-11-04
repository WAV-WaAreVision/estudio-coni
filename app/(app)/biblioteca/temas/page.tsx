import { Panel } from "@/components/ui/panel"
import { listarPilaresDeTemas, listarTemas } from "@/lib/datos/biblioteca"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import {
  AVISO_TRAS_OCULTAR_LA_ULTIMA,
  contarCoberturas,
  filtrarPorCobertura,
  hayFiltrosDeTemas,
  leerFiltrosDeTemas,
  leerIdeaOculta,
} from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { AvisoDeIdeas } from "../aviso-de-ideas"
import { FocoDelPanel } from "../foco-del-panel"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { FiltrosDeCobertura } from "./filtros-de-cobertura"
import { MasFiltrosDeTemas } from "./mas-filtros-de-temas"
import { PanelDeTema } from "./panel-de-tema"
import { TablaDeTemas } from "./tabla-de-temas"
import { TarjetaDeTema } from "./tarjeta-de-tema"

export default async function Temas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const pilares = await listarPilaresDeTemas(db)
  const filtros = leerFiltrosDeTemas(
    params,
    pilares.map((pilar) => pilar.id),
  )
  const seleccion = leerSeleccion(params, "t")
  // The pillar narrows what is read; the coverage splits it, so its counts are the pillar's.
  const temas = await listarTemas(db, { pilar: filtros.pilar })
  const visibles = filtrarPorCobertura(temas, filtros.cobertura)
  const elegido = seleccion ? (temas.find((tema) => tema.id === seleccion) ?? null) : null

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      <div className="grid min-w-0 gap-5">
        <h1 className="text-pantalla">Biblioteca</h1>
        <AvisoDeIdeas texto={leerIdeaOculta(params) ? AVISO_TRAS_OCULTAR_LA_ULTIMA : null} />
        <NavDeBiblioteca actual="temas" />
        <div className="flex flex-wrap items-start gap-2">
          <FiltrosDeCobertura filtros={filtros} conteos={contarCoberturas(temas)} />
          <MasFiltrosDeTemas filtros={filtros} pilares={pilares} />
        </div>
        {visibles.length === 0 ? (
          <p className="text-cuerpo text-apagado">
            {hayFiltrosDeTemas(filtros)
              ? "Ningún tema coincide con esos filtros."
              : "Los temas aparecen solos cuando varias ideas sacadas hablan de lo mismo. Sube más material de distintos autores."}
          </p>
        ) : (
          <>
            <ul aria-label="Temas" className="grid gap-3 md:hidden">
              {visibles.map((tema) => (
                <TarjetaDeTema key={tema.id} tema={tema} />
              ))}
            </ul>
            <div className="hidden md:block">
              <TablaDeTemas temas={visibles} filtros={filtros} seleccion={seleccion} />
            </div>
          </>
        )}
      </div>
      <aside
        aria-label="Tema elegido"
        className="hidden md:sticky md:top-24 md:block md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
      >
        {elegido ? (
          <PanelDeTema tema={elegido} filtros={filtros} />
        ) : (
          <Panel>
            <p className="text-cuerpo text-apagado">
              {seleccion
                ? "No encontré ese tema. Elige otro de la tabla."
                : "Elige un tema de la tabla para ver aquí cuántas ideas sacadas tiene y de quiénes."}
            </p>
          </Panel>
        )}
      </aside>
    </div>
  )
}
