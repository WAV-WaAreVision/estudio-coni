import { Panel } from "@/components/ui/panel"
import { resumirAutores } from "@/lib/datos/biblioteca"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import { exigirConi } from "@/lib/sesion/coni"
import { FocoDelPanel } from "../foco-del-panel"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { ListaDeAutores } from "./lista-de-autores"
import { PanelDeAutor } from "./panel-de-autor"

export default async function Autores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const seleccion = leerSeleccion(params, "a")
  const autores = await resumirAutores(db)
  const elegido = seleccion ? (autores.find((autor) => autor.id === seleccion) ?? null) : null

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <FocoDelPanel seleccion={seleccion} />
      <div className="grid min-w-0 gap-5">
        <h1 className="text-pantalla">Biblioteca</h1>
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
