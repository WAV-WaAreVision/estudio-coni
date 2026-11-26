import { notFound } from "next/navigation"
import { z } from "zod"
import { INTRO_DE_PAGINA, PRINCIPAL_Y_PANEL } from "@/components/pagina-en-columnas"
import { Volver } from "@/components/ui/volver"
import { leerGancho } from "@/lib/datos/ganchos"
import { leerTiposDeGancho } from "@/lib/datos/vocabulario"
import { filtrosDeParametros, hrefDeGanchos } from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import { exigirConi } from "@/lib/sesion/coni"
import { cn } from "@/lib/utils"
import { BotonFavorito } from "../boton-favorito"
import { DetalleDeGancho } from "../detalle-de-gancho"

/** One hook on its own page: the phone's detail, and a link that works on a computer too. «Volver» keeps her filters. */
export default async function PaginaDeGancho({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, { id }, consulta] = await Promise.all([exigirConi(), params, searchParams])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const [gancho, tipos] = await Promise.all([leerGancho(db, valido.data), leerTiposDeGancho(db)])
  if (!gancho) notFound()
  // On a computer the detail fills the main area and the star goes to a 20rem panel; on a phone, one column.
  return (
    <div className={cn("grid gap-6", PRINCIPAL_Y_PANEL)}>
      <div className="contents md:grid md:min-w-0 md:gap-6">
        <Volver href={hrefDeGanchos(filtrosDeParametros(consulta))}>Ganchos</Volver>
        <h1 className={cn("text-pantalla text-balance", INTRO_DE_PAGINA)}>
          <span className="sr-only">Frase exacta:</span> {`«${gancho.fraseExacta}»`}
        </h1>
        <DetalleDeGancho gancho={gancho} tipos={tipos} />
      </div>
      <div className="contents md:grid md:content-start md:gap-6">
        <BotonFavorito afirmacionId={gancho.afirmacionId} favorito={gancho.favorito} />
      </div>
    </div>
  )
}
