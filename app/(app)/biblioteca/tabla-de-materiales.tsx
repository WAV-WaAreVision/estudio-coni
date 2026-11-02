import Link from "next/link"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"
import { subidoHace, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { type FiltrosDeMateriales, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"
import { etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { cn } from "@/lib/utils"
import { EstadoDeMaterial } from "./estado-de-material"
import { TemaDelMaterial } from "./tema-del-material"

const COLUMNAS = ["Material", "Tipo", "Autor", "Tema", "Estado", "Subido"] as const
const CELDA = "px-3 py-3 text-cuerpo"
// Type, author, state and date are short: on one line, so the title column is the one that wraps.
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
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">Materiales</caption>
      <thead>
        <tr className="border-b border-tinta">
          {COLUMNAS.map((columna) => (
            <th key={columna} scope="col" className="px-3 py-2 text-meta font-medium text-apagado">
              {columna}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {materiales.map((material) => {
          const elegido = material.id === seleccion
          return (
            <tr key={material.id} className={cn("border-b border-hilo", elegido && "bg-piedra-alta")}>
              <th scope="row" className={cn(CELDA, "font-semibold")}>
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
              <td className={CORTA}>{material.autor}</td>
              <td className={CELDA}>
                <TemaDelMaterial tema={material.tema} />
              </td>
              <td className={CORTA}>
                <EstadoDeMaterial material={material} />
              </td>
              <td data-snapshot="varia" className="whitespace-nowrap px-3 py-3 text-meta text-apagado">
                {subidoHace(material.creado_en, ahora, ZONA_DE_LA_BIBLIOTECA)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
