import { Panel } from "@/components/ui/panel"
import { leerNombreDeLoBorrado, resumirAutores } from "@/lib/datos/biblioteca"
import { ID_DEL_TITULO_DE_LA_LISTA, leerBorrado } from "@/lib/dominio/biblioteca/borrado"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { exigirConi } from "@/lib/sesion/coni"
import { AvisoDeBorrado } from "../aviso-de-borrado"
import { FocoDelPanel } from "../foco-del-panel"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { TrasElAviso } from "../tras-el-aviso"
import { ListaDeAutores } from "./lista-de-autores"
import { PanelDeAutor } from "./panel-de-autor"

export default async function Autores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const seleccion = leerSeleccion(params, "a")
  const borrado = leerBorrado(params)
  const [autores, loBorrado] = await Promise.all([
    resumirAutores(db),
    borrado ? leerNombreDeLoBorrado(db, "autor", borrado) : null,
  ])
  const elegido = seleccion ? (autores.find((autor) => autor.id === seleccion) ?? null) : null

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      {borrado ? <TrasElAviso parametro="aviso" tambien="id" /> : null}
      {/* Always drawn: its toast outlives the note leaving the address (plan D6). */}
      <AvisoDeBorrado tipo="autor" borrado={borrado && loBorrado ? { id: borrado, nombre: loBorrado.nombre } : null} />
      <div className="grid min-w-0 gap-5">
        <h1 id={ID_DEL_TITULO_DE_LA_LISTA} tabIndex={-1} className="text-pantalla outline-none">
          Biblioteca
        </h1>
        <NavDeBiblioteca actual="autores" />
        <ListaDeAutores autores={autores} seleccion={seleccion} />
      </div>
      <aside
        aria-label="Autor elegido"
        className="hidden md:sticky md:top-24 md:block md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
      >
        {elegido ? (
          <PanelDeAutor autor={elegido} />
        ) : (
          <Panel>
            <p className="text-cuerpo text-apagado">
              {seleccion
                ? "No encontré a esa persona. Elige otra de la tabla."
                : "Elige un autor de la tabla para ver aquí sus temas y sus ideas sacadas."}
            </p>
          </Panel>
        )}
      </aside>
    </div>
  )
}
