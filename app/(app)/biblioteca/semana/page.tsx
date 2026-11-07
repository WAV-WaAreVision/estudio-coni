import { leerPausasAbiertas } from "@/lib/datos/pausas"
import { leerCostosDelMotor, leerSemana } from "@/lib/datos/semana"
import { estimarCostoDelMotor } from "@/lib/dominio/biblioteca/semana"
import { textoDePausa } from "@/lib/dominio/pausas"
import { exigirConi } from "@/lib/sesion/coni"
import { NavDeBiblioteca } from "../nav-de-biblioteca"
import { VistaDeSemana } from "./vista-de-semana"

/** The engine's latest run (ported from Ingesta's `semana/page.tsx`); only Coni enters (spec decision 1). */
export default async function Semana() {
  const { db } = await exigirConi()
  const [semana, costos, pausas] = await Promise.all([leerSemana(db), leerCostosDelMotor(db), leerPausasAbiertas(db)])
  return (
    <VistaDeSemana
      encabezado={
        <>
          <h1 className="text-pantalla">Biblioteca</h1>
          <NavDeBiblioteca actual="semana" />
        </>
      }
      semana={semana}
      costoUsd={estimarCostoDelMotor(costos)}
      pausa={textoDePausa(pausas, "claude")}
    />
  )
}
