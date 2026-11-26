import { Star } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { ICONO } from "@/components/ui/icono"
import { type FiltrosDeGanchos, hrefDeGanchos } from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import { etiquetaDeTipo, type GanchoDeLista, type TipoDeGancho } from "@/lib/dominio/biblioteca/ganchos"
import { cn } from "@/lib/utils"

const CELDA = "px-2 py-3 text-cuerpo"
// Beside the 20rem panel, 768 to 1023 px leave room for the phrase, its type and the star only (plan decision 5).
const SOLO_ANCHA = "hidden lg:table-cell"
const ENCABEZADO = "px-2 py-2 text-meta font-medium text-apagado"

/** The computer's hooks: each row links to `?g=<id>` with her filters, so it opens the side panel and Back closes it. */
export function TablaDeGanchos({
  ganchos,
  tipos,
  filtros,
  seleccion,
}: {
  ganchos: GanchoDeLista[]
  tipos: readonly TipoDeGancho[]
  filtros: FiltrosDeGanchos
  seleccion: string | null
}) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Ganchos</caption>
      <thead>
        <tr className="border-b border-tinta">
          <th scope="col" className={ENCABEZADO}>
            Frase exacta
          </th>
          <th scope="col" className={cn(ENCABEZADO, "w-[7rem]")}>
            Tipo
          </th>
          <th scope="col" className={cn(ENCABEZADO, SOLO_ANCHA, "w-[7rem]")}>
            Autor
          </th>
          <th scope="col" className={cn(ENCABEZADO, SOLO_ANCHA, "w-[7rem]")}>
            Tema
          </th>
          <th scope="col" className={cn(ENCABEZADO, "w-[3rem]")}>
            <Star aria-hidden="true" weight="fill" size={ICONO.chico} />
            <span className="sr-only">Favorito</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {ganchos.map((gancho) => {
          const elegido = gancho.afirmacionId === seleccion
          return (
            <tr key={gancho.afirmacionId} className={cn("border-b border-hilo", elegido && "bg-piedra-alta")}>
              <th scope="row" className={cn(CELDA, "px-3 font-semibold")}>
                <Link
                  href={hrefDeGanchos(filtros, gancho.afirmacionId)}
                  scroll={false}
                  aria-current={elegido ? "true" : undefined}
                  data-abre-panel={gancho.afirmacionId}
                  className="text-balance text-tinta underline-offset-4 hover:underline"
                >
                  {`«${gancho.fraseExacta}»`}
                </Link>
              </th>
              <td className={CELDA}>{etiquetaDeTipo(tipos, gancho.tipo)}</td>
              <td className={cn(CELDA, SOLO_ANCHA)}>{gancho.autor?.nombre}</td>
              <td className={cn(CELDA, SOLO_ANCHA)}>{gancho.tema?.nombre}</td>
              <td className={CELDA}>
                {gancho.favorito ? (
                  <>
                    <Star aria-hidden="true" weight="fill" size={ICONO.chico} />
                    <span className="sr-only">Favorito</span>
                  </>
                ) : null}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
