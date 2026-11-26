import { notFound } from "next/navigation"
import { z } from "zod"
import { Volver } from "@/components/ui/volver"
import { leerAfirmacion } from "@/lib/datos/afirmaciones"
import { leerCatalogoDeEtiquetas } from "@/lib/datos/vocabulario"
import { volverDesde } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { exigirConi } from "@/lib/sesion/coni"
import { CabeceraDeAfirmacion } from "./cabecera-de-afirmacion"
import { EtiquetasDeAfirmacion } from "./etiquetas-de-afirmacion"

/** A claim with every tag (spec 6c-1): the one place where Coni confirms and corrects them. */
export default async function PaginaDeAfirmacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, { id }, consulta] = await Promise.all([exigirConi(), params, searchParams])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const [afirmacion, catalogo] = await Promise.all([leerAfirmacion(db, valido.data), leerCatalogoDeEtiquetas(db)])
  if (!afirmacion) notFound()
  const volver = volverDesde(consulta, afirmacion.material.id)
  // On a computer the text reads on the left and the tags take the wider right column; a phone reads them in that
  // order, in one column.
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-x-8 lg:gap-x-12">
      <div data-testid="pagina-principal" className="grid min-w-0 gap-6">
        <Volver href={volver.href}>{volver.texto}</Volver>
        <CabeceraDeAfirmacion afirmacion={afirmacion} />
      </div>
      <div data-testid="pagina-etiquetas" className="grid min-w-0 gap-6">
        <EtiquetasDeAfirmacion afirmacion={afirmacion} catalogo={catalogo} />
      </div>
    </div>
  )
}
