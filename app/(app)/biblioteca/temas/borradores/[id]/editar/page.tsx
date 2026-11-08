import { notFound } from "next/navigation"
import { z } from "zod"
import { FORMULARIO_Y_PANEL, INTRO_DE_PAGINA } from "@/components/pagina-en-columnas"
import { Volver } from "@/components/ui/volver"
import { leerBorrador } from "@/lib/datos/borradores"
import { camposDeBorradorDePilar, camposDeBorradorDeRed, RUTA_DE_BORRADORES } from "@/lib/dominio/biblioteca/borradores"
import { NOMBRE_DE_RED } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { cn } from "@/lib/utils"
import { FormularioDePilar } from "../../../formulario-de-pilar"
import { FormularioDeRed } from "../../../formulario-de-red"
import { PanelAlGuardar } from "../../../panel-al-guardar"

/** Decision 10: one address for both kinds; a draft already decided cannot be edited (row level security agrees). */
export default async function EditarBorrador({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const leido = await leerBorrador(db, valido.data)
  if (!leido) notFound()
  return (
    <div className="grid gap-6">
      <Volver href={RUTA_DE_BORRADORES}>Borradores</Volver>
      {leido.tipo === "pilar" ? (
        <>
          <header className={cn("grid gap-2", INTRO_DE_PAGINA)}>
            <h1 className="text-pantalla text-balance">Editar borrador de pilar</h1>
            <p className="text-cuerpo">{`Red: ${NOMBRE_DE_RED[leido.borrador.red]}`}</p>
          </header>
          <div className={FORMULARIO_Y_PANEL}>
            <div data-testid="pagina-principal" className="min-w-0">
              <FormularioDePilar
                modo={{ tipo: "editar", id: leido.borrador.id }}
                inicial={camposDeBorradorDePilar(leido.borrador)}
                cancelar={RUTA_DE_BORRADORES}
              />
            </div>
            <PanelAlGuardar tipo="pilar" />
          </div>
        </>
      ) : (
        <>
          <h1 className={cn("text-pantalla text-balance", INTRO_DE_PAGINA)}>Editar borrador de red</h1>
          <div className={FORMULARIO_Y_PANEL}>
            <div data-testid="pagina-principal" className="min-w-0">
              <FormularioDeRed
                modo={{ tipo: "editar", id: leido.borrador.id }}
                inicial={camposDeBorradorDeRed(leido.borrador)}
                cancelar={RUTA_DE_BORRADORES}
              />
            </div>
            <PanelAlGuardar tipo="red" />
          </div>
        </>
      )}
    </div>
  )
}
