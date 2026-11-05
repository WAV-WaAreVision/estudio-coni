import { notFound } from "next/navigation"
import { z } from "zod"
import { Volver } from "@/components/ui/volver"
import { leerBorrador } from "@/lib/datos/borradores"
import { camposDeBorradorDePilar, camposDeBorradorDeRed, RUTA_DE_BORRADORES } from "@/lib/dominio/biblioteca/borradores"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { FormularioDePilar } from "../../../formulario-de-pilar"
import { FormularioDeRed } from "../../../formulario-de-red"

/** Decision 10: one address for both kinds; a draft already decided cannot be edited (row level security agrees). */
export default async function EditarBorrador({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const leido = await leerBorrador(db, valido.data)
  if (!leido) notFound()
  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_BORRADORES}>Borradores</Volver>
      {leido.tipo === "pilar" ? (
        <>
          <header className="grid gap-2">
            <h1 className="text-pantalla text-balance">Editar borrador de pilar</h1>
            <p className="text-cuerpo">{`Red: ${NOMBRE_DE_RED[leido.borrador.red]}`}</p>
          </header>
          <FormularioDePilar
            modo={{ tipo: "editar", id: leido.borrador.id }}
            inicial={camposDeBorradorDePilar(leido.borrador)}
            cancelar={RUTA_DE_BORRADORES}
          />
        </>
      ) : (
        <>
          <h1 className="text-pantalla text-balance">Editar borrador de red</h1>
          <FormularioDeRed
            modo={{ tipo: "editar", id: leido.borrador.id }}
            inicial={camposDeBorradorDeRed(leido.borrador)}
            cancelar={RUTA_DE_BORRADORES}
          />
        </>
      )}
    </div>
  )
}
