import { FORMULARIO_Y_PANEL, INTRO_DE_PAGINA } from "@/components/pagina-en-columnas"
import { Volver } from "@/components/ui/volver"
import { leerUltimaRed } from "@/lib/datos/biblioteca"
import { leerRedPedida } from "@/lib/dominio/biblioteca/borradores"
import { hrefDeTemas } from "@/lib/dominio/biblioteca/fila-de-temas"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { cn } from "@/lib/utils"
import { FormularioDePilar } from "../formulario-de-pilar"
import { PanelAlGuardar } from "../panel-al-guardar"

/** «+ Agregar pilar» (spec 15c): the network comes from the address and shows as text. */
export default async function PilarNuevo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const red = leerRedPedida(params, await leerUltimaRed(db))
  const volver = hrefDeTemas({ red })
  return (
    <div className="grid gap-6">
      <Volver href={volver}>Temas</Volver>
      <header className={cn("grid gap-2", INTRO_DE_PAGINA)}>
        <h1 className="text-pantalla text-balance">Nuevo pilar</h1>
        <p className="text-cuerpo">{`Red: ${NOMBRE_DE_RED[red]}`}</p>
        <p className="text-meta text-apagado">
          Se guarda como borrador. Entra a la lista de Temas cuando lo apruebes en Borradores.
        </p>
      </header>
      <div className={FORMULARIO_Y_PANEL}>
        <div data-testid="pagina-principal" className="min-w-0">
          <FormularioDePilar modo={{ tipo: "nuevo", red }} cancelar={volver} />
        </div>
        <PanelAlGuardar tipo="pilar" />
      </div>
    </div>
  )
}
