import { Volver } from "@/components/ui/volver"
import { leerRegistroDeDatos } from "@/lib/datos-personales/leer"
import { presentarRegistro } from "@/lib/datos-personales/presentar"
import { exigirConi } from "@/lib/sesion/coni"
import { marcarInventarioRevisadoAccion } from "../acciones"
import { RegistroDeDatos } from "./registro-de-datos"

/** Ajustes › Datos personales (spec 2026-11-01): read-only for Coni, plus «Lo revisé» once a year. */
export default async function DatosPersonales() {
  const { db } = await exigirConi()
  const vista = presentarRegistro(await leerRegistroDeDatos(db))

  return (
    <div>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="mt-5 text-pantalla text-balance">Datos personales</h1>
      <p className="mt-1.5 text-meta text-apagado">
        Lo que Conidolly guarda, para qué, dónde queda y cuándo se borra. WAV lo mantiene al día; tú lo revisas una vez
        al año.
      </p>
      <div className="mt-6">
        <RegistroDeDatos {...vista} marcar={marcarInventarioRevisadoAccion} />
      </div>
    </div>
  )
}
