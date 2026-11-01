import { Seccion } from "@/components/seccion"
import { FilaNavegacion } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { filaDePresupuesto } from "@/lib/presupuesto/presentar"

/** Spec 2026-11-02: Ajustes keeps one row with the month against the cap; the panel is Ajustes › Presupuesto. */
export function TuPresupuesto({ usado, tope }: { usado: number; tope: number }) {
  return (
    <Seccion titulo="Gasto" id="ajuste-presupuesto">
      <Grupo>
        <FilaNavegacion href="/ajustes/presupuesto">{filaDePresupuesto(usado, tope)}</FilaNavegacion>
      </Grupo>
    </Seccion>
  )
}
