import { Volver } from "@/components/ui/volver"
import { leerPresupuestoDelMes } from "@/lib/presupuesto/leer"
import { exigirConi } from "@/lib/sesion/coni"
import { guardarAjusteAccion, reactivarLimiteAccion } from "../acciones"
import { PantallaDePresupuesto } from "./pantalla-de-presupuesto"

/** Ajustes › Presupuesto (spec 2026-11-02): Coni only. The cap is a reference; the limit is the brake. */
export default async function Presupuesto() {
  const { db } = await exigirConi()
  const presupuesto = await leerPresupuestoDelMes(db, Date.now())

  return (
    <div>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="mt-5 text-pantalla text-balance">Presupuesto</h1>
      <p className="mt-1.5 text-meta text-apagado">
        Tu tope es una referencia: al pasarlo, la app sigue. Tu límite es el freno: ahí lo nuevo queda en pausa y lo que
        ya firmaste termina.
      </p>
      <div className="mt-6">
        <PantallaDePresupuesto
          inicial={presupuesto}
          acciones={{ guardar: guardarAjusteAccion, reactivar: reactivarLimiteAccion }}
        />
      </div>
    </div>
  )
}
