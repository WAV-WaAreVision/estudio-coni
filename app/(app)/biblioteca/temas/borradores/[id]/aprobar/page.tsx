import { notFound } from "next/navigation"
import { z } from "zod"
import { Volver } from "@/components/ui/volver"
import { leerBorrador } from "@/lib/datos/borradores"
import { etapasDeRed } from "@/lib/datos/pilares"
import { etapasDeAprobacion, RUTA_DE_BORRADORES } from "@/lib/dominio/biblioteca/borradores"
import { ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { diaLocal } from "@/lib/dominio/fechas"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { AprobarPilar } from "./aprobar-pilar"

/** Spec 15c: approving a pillar draft, with every stage of its network's weights from today in Chile (the RPC's date). */
export default async function AprobarBorrador({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const leido = await leerBorrador(db, valido.data)
  // A network draft is never approved in 15c; a decided one is gone from the list.
  if (!leido || leido.tipo !== "pilar") notFound()
  const { borrador } = leido
  const hoy = diaLocal(Date.now(), ZONA_DE_LA_BIBLIOTECA)
  const etapas = await etapasDeRed(db, borrador.red, hoy)
  return (
    <div className="grid gap-6 md:max-w-[64rem]">
      <Volver href={RUTA_DE_BORRADORES}>Borradores</Volver>
      <header className="grid gap-2 md:max-w-[42rem]">
        <h1 className="text-pantalla text-balance">{`Aprobar «${borrador.nombreCorto}»`}</h1>
        <p className="text-cuerpo">{`${borrador.nombre}. Entra a ${NOMBRE_DE_RED[borrador.red]}.`}</p>
        <p className="text-meta text-apagado">Revisa los pesos de la red en cada etapa: puedes cambiar cualquiera.</p>
      </header>
      <AprobarPilar
        borrador={borrador}
        etapas={etapasDeAprobacion(borrador, etapas, hoy)}
        cancelar={RUTA_DE_BORRADORES}
      />
    </div>
  )
}
