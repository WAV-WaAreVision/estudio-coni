import { Seccion } from "@/components/seccion"
import { FilaNavegacion } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"

/** Ley 21.719 (spec 2026-11-01): what the app keeps about her, and what she says in public about AI. */
export function TusDatos() {
  return (
    <Seccion titulo="Tus datos y la IA" id="ajuste-tus-datos">
      <Grupo>
        <FilaNavegacion href="/ajustes/datos-personales">Datos personales</FilaNavegacion>
        <FilaNavegacion href="/ajustes/pagina-de-ia">Página de IA</FilaNavegacion>
      </Grupo>
    </Seccion>
  )
}
