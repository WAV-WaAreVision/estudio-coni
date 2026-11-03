import { listarAutores } from "@/lib/datos/biblioteca"
import { exigirConi } from "@/lib/sesion/coni"
import { FormularioDeSubida } from "./formulario-de-subida"

// Not a tab of the section: the Materiales header and its empty state link here. Loading, error and not-found are the
// section's own (batch 1). The way back lives in the form: it goes inactive while a file is uploading.
export default async function Subir() {
  const { db } = await exigirConi()
  const autores = await listarAutores(db)
  return (
    <div className="grid w-full gap-6 md:max-w-[42rem]">
      <FormularioDeSubida
        autores={autores}
        encabezado={<h1 className="text-pantalla text-balance">Subir material</h1>}
      />
    </div>
  )
}
