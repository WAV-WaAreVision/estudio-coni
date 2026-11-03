import Link from "next/link"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"
import { subidoHace, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { type FiltrosDeMateriales, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"
import { etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { cn } from "@/lib/utils"
import { EstadoDeMaterial } from "./estado-de-material"
import { TemaDelMaterial } from "./tema-del-material"

// A fixed layout: the five short columns get set widths and the title takes the rest, so at 1280 px with the panel open
// a title wraps to two lines at most. Author, topic and date may wrap; type and state fit their width on one line.
const COLUMNAS = [
  { nombre: "Material", ancho: undefined },
  { nombre: "Tipo", ancho: "w-[6.5rem]" },
  { nombre: "Autor", ancho: "w-[7.5rem]" },
  { nombre: "Tema", ancho: "w-[7rem]" },
  { nombre: "Estado", ancho: "w-[9.75rem]" },
  { nombre: "Subido", ancho: "w-[6rem]" },
] as const
const CELDA = "px-2 py-3 text-cuerpo"
const CORTA = `${CELDA} whitespace-nowrap`

interface Propiedades {
  materiales: MaterialDeLista[]
  filtros: FiltrosDeMateriales
  seleccion: string | null
  ahora: number
}

/**
 * The computer's list (spec 3): a plain table whose rows are links to `?m=<id>`, so a row opens the side panel, the
 * address can be shared and Back closes it. The buttons live in the panel.
 */
export function TablaDeMateriales({ materiales, filtros, seleccion, ahora }: Propiedades) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Materiales</caption>
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
        {materiales.map((material) => {
          const elegido = material.id === seleccion
          return (
            <tr key={material.id} className={cn("border-b border-hilo", elegido && "bg-piedra-alta")}>
              <th scope="row" className={cn(CELDA, "px-3 font-semibold")}>
                <Link
                  href={hrefDeLista(filtros, material.id)}
                  scroll={false}
                  aria-current={elegido ? "true" : undefined}
                  data-abre-panel={material.id}
                  className="text-balance text-tinta underline-offset-4 hover:underline"
                >
                  {material.titulo ?? "Sin título"}
                </Link>
              </th>
              <td className={CORTA}>{etiquetaDeTipo(material.tipo)}</td>
              <td className={CELDA}>{material.autor}</td>
              <td className={CELDA}>
                <TemaDelMaterial tema={material.tema} />
              </td>
              <td className={CORTA}>
                <EstadoDeMaterial material={material} />
              </td>
              <td data-snapshot="varia" className="px-2 py-3 text-meta text-apagado">
                {subidoHace(material.creado_en, ahora, ZONA_DE_LA_BIBLIOTECA)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
