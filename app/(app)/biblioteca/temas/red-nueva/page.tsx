import { Volver } from "@/components/ui/volver"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { FormularioDeRed } from "../formulario-de-red"

/** «+ Agregar red» (spec 15c): a draft that waits for WAV; it is never approved here. */
export default async function RedNueva() {
  await exigirConi()
  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">Nueva red</h1>
        <p className="text-cuerpo">WAV conecta la red cuando esté lista. Este borrador solo guarda tu idea.</p>
      </header>
      <FormularioDeRed modo={{ tipo: "nuevo" }} cancelar={RUTA_DE_TEMAS} />
    </div>
  )
}
