import { FORMULARIO_Y_PANEL, INTRO_DE_PAGINA } from "@/components/pagina-en-columnas"
import { Volver } from "@/components/ui/volver"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { cn } from "@/lib/utils"
import { FormularioDeRed } from "../formulario-de-red"
import { PanelAlGuardar } from "../panel-al-guardar"

/** «+ Agregar red» (spec 15c): a draft that waits for WAV; it is never approved here. */
export default async function RedNueva() {
  await exigirConi()
  return (
    <div className="grid gap-6">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <header className={cn("grid gap-2", INTRO_DE_PAGINA)}>
        <h1 className="text-pantalla text-balance">Nueva red</h1>
        <p className="text-cuerpo">WAV conecta la red cuando esté lista. Este borrador solo guarda tu idea.</p>
      </header>
      <div className={FORMULARIO_Y_PANEL}>
        <div data-testid="pagina-principal" className="min-w-0">
          <FormularioDeRed modo={{ tipo: "nuevo" }} cancelar={RUTA_DE_TEMAS} />
        </div>
        <PanelAlGuardar tipo="red" />
      </div>
    </div>
  )
}
