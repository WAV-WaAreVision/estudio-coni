import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { Volver } from "@/components/ui/volver"
import { destinoDeTema, leerTema } from "@/lib/datos/biblioteca"
import { hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { cuentasDeTema } from "@/lib/dominio/biblioteca/cuentas"
import {
  AVISO_TRAS_OCULTAR,
  hrefDeTema,
  hrefTrasOcultar,
  leerIdeaOculta,
  RUTA_DE_TEMAS,
} from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { AvisoDeIdeas } from "../../aviso-de-ideas"
import { BotonOcultar } from "../../boton-ocultar"
import { ListaDeIdeas } from "../../lista-de-ideas"
import { TrasElAviso } from "../../tras-el-aviso"

/** One topic (ported from Ingesta's `temas/[id]/page.tsx`): its ideas by author, each with Ocultar. */
export default async function DetalleDeTema({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, { id }, consulta] = await Promise.all([exigirConi(), params, searchParams])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  // A merged topic's address leads to the one that stayed; a missing one or a loop is not found.
  const destino = await destinoDeTema(db, valido.data)
  // Hiding what turned out to be its last idea (another tab, the nightly run) deleted the topic: the list says the note.
  const ideaOculta = leerIdeaOculta(consulta)
  if (destino === null && ideaOculta !== null) redirect(`${RUTA_DE_TEMAS}?oculta=${ideaOculta}`)
  if (destino === null) notFound()
  if (destino !== valido.data) redirect(hrefDeTema(destino))
  const leido = await leerTema(db, destino)
  if (!leido) notFound()
  const { tema, ideas, autores } = leido
  const cuentas = cuentasDeTema({ ideas, autores: autores.length })

  const oculta = ideaOculta !== null
  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">{tema.nombre}</h1>
        {tema.descripcion ? <p className="text-cuerpo">{tema.descripcion}</p> : null}
        {cuentas ? <p className="text-meta text-apagado">{cuentas}</p> : null}
      </header>
      <AvisoDeIdeas texto={oculta ? AVISO_TRAS_OCULTAR : null} />
      {oculta ? <TrasElAviso parametro="oculta" /> : null}

      {autores.map((grupo) => {
        const idDelTitulo = `autor-${grupo.autor.id}`
        return (
          <section key={grupo.autor.id} aria-labelledby={idDelTitulo} className="grid gap-3">
            <div className="grid gap-0.5">
              <h2 id={idDelTitulo} className="text-pieza text-balance">
                <Link
                  href={hrefDeAutor(grupo.autor.id)}
                  className="inline-flex min-h-objetivo items-center underline decoration-1 underline-offset-4"
                >
                  {grupo.autor.nombre}
                </Link>
              </h2>
              {grupo.autor.credencial ? <p className="text-meta text-apagado">{grupo.autor.credencial}</p> : null}
            </div>
            <ListaDeIdeas
              etiqueta={`Ideas de ${grupo.autor.nombre}`}
              ideas={grupo.ideas}
              accion={(idea) => (
                <BotonOcultar ideaId={idea.id} oculta={false} despues={hrefTrasOcultar(tema.id, idea.id, ideas)} />
              )}
            />
          </section>
        )
      })}
    </div>
  )
}
