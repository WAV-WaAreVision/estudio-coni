import Link from "next/link"
import { type AutorResumido, hrefDeAutores } from "@/lib/dominio/biblioteca/autores"
import { cuentasDeAutor } from "@/lib/dominio/biblioteca/cuentas"
import { etiquetaDeTipoDeAutor } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { cn } from "@/lib/utils"

// As the Materiales table: fixed widths for the short columns, the name takes the rest.
const COLUMNAS = [
  { nombre: "Autor", ancho: undefined },
  { nombre: "Tipo", ancho: "w-[8rem]" },
  { nombre: "Temas", ancho: "w-[12rem]" },
  { nombre: "Materiales", ancho: "w-[6.5rem]" },
  { nombre: PALABRAS.afirmaciones, ancho: "w-[7rem]" },
] as const
const CELDA = "px-2 py-3 text-cuerpo"
const NUMERO = `${CELDA} tabular-nums`

/** A zero is not written (4i). */
const cifra = (cantidad: number) => (cantidad > 0 ? cantidad : null)

/** The computer's authors: each row is a link to `?a=<id>`, so it opens the side panel and Back closes it. */
export function TablaDeAutores({ autores, seleccion }: { autores: AutorResumido[]; seleccion: string | null }) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Autores</caption>
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
        {autores.map((autor) => {
          const elegido = autor.id === seleccion
          return (
            <tr key={autor.id} className={cn("border-b border-hilo", elegido && "bg-piedra-alta")}>
              <th scope="row" className={cn(CELDA, "px-3 font-semibold")}>
                <Link
                  href={hrefDeAutores(autor.id)}
                  scroll={false}
                  aria-current={elegido ? "true" : undefined}
                  data-abre-panel={autor.id}
                  className="text-balance text-tinta underline-offset-4 hover:underline"
                >
                  {autor.nombre}
                </Link>
              </th>
              <td className={CELDA}>{etiquetaDeTipoDeAutor(autor.tipo)}</td>
              <td className={CELDA}>
                {/* Without material the row would be blank; the way to give it some is in its panel. */}
                {cuentasDeAutor(autor) === null ? (
                  <span className="text-apagado">Todavía no hay material</span>
                ) : (
                  autor.temas.map((tema) => tema.nombre).join(" · ")
                )}
              </td>
              <td className={NUMERO}>{cifra(autor.materiales)}</td>
              <td className={NUMERO}>{cifra(autor.ideas)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
