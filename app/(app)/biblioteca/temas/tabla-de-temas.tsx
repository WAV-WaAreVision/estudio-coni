import Link from "next/link"
import { type FiltrosDeTemas, hrefDeTemas } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"
import { cn } from "@/lib/utils"
import { Insignias } from "./insignias"

const COLUMNAS = [
  { nombre: "Tema", ancho: undefined },
  { nombre: PALABRAS.afirmaciones, ancho: "w-[8rem]" },
  { nombre: "Autores", ancho: "w-[6.5rem]" },
] as const
const CELDA = "px-2 py-3 text-cuerpo"

interface Propiedades {
  temas: TemaResumido[]
  filtros: FiltrosDeTemas
  seleccion: string | null
}

/** The computer's topics: each row is a link to `?t=<id>` that keeps the filters, so Back closes the panel. */
export function TablaDeTemas({ temas, filtros, seleccion }: Propiedades) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Temas</caption>
      <colgroup>
        {COLUMNAS.map((columna) => (
          <col key={columna.nombre} className={columna.ancho} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-b border-tinta">
          {COLUMNAS.map((columna) => (
            <th key={columna.nombre} scope="col" className="px-2 py-2 text-meta font-medium text-apagado">
              {columna.nombre}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {temas.map((tema) => {
          const elegido = tema.id === seleccion
          return (
            <tr key={tema.id} className={cn("border-b border-hilo", elegido && "bg-piedra-alta")}>
              <th scope="row" className={cn(CELDA, "px-3 font-semibold")}>
                {/* The grid lives inside the cell: a grid on the th itself would take it out of the table's layout. */}
                <div className="grid gap-1.5">
                  <Link
                    href={hrefDeTemas(filtros, tema.id)}
                    scroll={false}
                    aria-current={elegido ? "true" : undefined}
                    data-abre-panel={tema.id}
                    className="w-fit text-balance text-tinta underline-offset-4 hover:underline"
                  >
                    {tema.nombre}
                  </Link>
                  <Insignias tema={tema} />
                </div>
              </th>
              <td className={`${CELDA} tabular-nums`}>{tema.ideas}</td>
              <td className={`${CELDA} tabular-nums`}>{tema.autores}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
