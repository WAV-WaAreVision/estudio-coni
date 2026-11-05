import { Panel } from "@/components/ui/panel"
import { leerFaltasDeAngulo } from "@/lib/datos/angulos"
import { leerUltimaRed, listarPilaresDeTemas, listarTemas } from "@/lib/datos/biblioteca"
import { contarBorradores } from "@/lib/datos/borradores"
import { faltasPorPilar } from "@/lib/dominio/angulos"
import { leerAviso } from "@/lib/dominio/biblioteca/borradores"
import {
  contarFiltros,
  filtrarTemas,
  hayFiltrosDeTemas,
  leerFiltrosDeTemas,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { AVISO_TRAS_OCULTAR_LA_ULTIMA, leerIdeaOculta } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { AvisoDeIdeas } from "../aviso-de-ideas"
import { FocoDelPanel } from "../foco-del-panel"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { TrasElAviso } from "../tras-el-aviso"
import { EnlaceABorradores } from "./enlace-a-borradores"
import { FilaDeTemas } from "./fila-de-temas"
import { MasFiltrosDeTemas } from "./mas-filtros-de-temas"
import { PanelDeTema } from "./panel-de-tema"
import { RecordarRed } from "./recordar-red"
import { TablaDeTemas } from "./tabla-de-temas"
import { TarjetaDeTema } from "./tarjeta-de-tema"

export default async function Temas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const [pilares, ultimaRed, borradores, faltas] = await Promise.all([
    listarPilaresDeTemas(db),
    leerUltimaRed(db),
    contarBorradores(db),
    leerFaltasDeAngulo(db, Date.now()),
  ])
  const filtros = leerFiltrosDeTemas(params, { pilares, ultimaRed })
  const seleccion = leerSeleccion(params, "t")
  // The network and the pillar narrow what is read; the switches split it, so their counts are the pillar's.
  const temas = await listarTemas(db, { red: filtros.red, pilar: filtros.pilar })
  const visibles = filtrarTemas(temas, filtros)
  const conteos = contarFiltros(temas)
  const elegido = seleccion ? (temas.find((tema) => tema.id === seleccion) ?? null) : null
  const ocultaLaUltima = leerIdeaOculta(params) !== null
  // A draft's form (15c) came back with its note; hiding a topic's last idea says its own instead.
  const aviso = ocultaLaUltima ? null : leerAviso(params)

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      <RecordarRed red={filtros.red} recordada={ultimaRed} />
      <div className="grid min-w-0 gap-5">
        <h1 className="text-pantalla">Biblioteca</h1>
        <AvisoDeIdeas texto={ocultaLaUltima ? AVISO_TRAS_OCULTAR_LA_ULTIMA : aviso} />
        {ocultaLaUltima ? <TrasElAviso parametro="oculta" /> : null}
        {/* Any `?aviso=` leaves the address, also one hiding's note took the place of, or one it does not know. */}
        {params.aviso === undefined ? null : <TrasElAviso parametro="aviso" />}
        <NavDeBiblioteca actual="temas" />
        <div className="grid min-w-0 gap-3">
          <FilaDeTemas
            filtros={filtros}
            pilares={pilares}
            sinTratar={conteos.sinTratar}
            faltas={faltasPorPilar(faltas)}
          />
          <EnlaceABorradores cantidad={borradores} />
          <MasFiltrosDeTemas filtros={filtros} conteos={conteos} />
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
