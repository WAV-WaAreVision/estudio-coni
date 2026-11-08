import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"
import { INTRO_DE_PAGINA, PRINCIPAL_Y_PANEL } from "@/components/pagina-en-columnas"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Volver } from "@/components/ui/volver"
import { leerAutor, listarAutores } from "@/lib/datos/biblioteca"
import { descripcionDeAutor, RUTA_DE_AUTORES, sePuedeUnir } from "@/lib/dominio/biblioteca/autores"
import { sePuedeBorrarAutor } from "@/lib/dominio/biblioteca/borrado"
import { cuentasDeAutor } from "@/lib/dominio/biblioteca/cuentas"
import {
  AVISO_TRAS_MOSTRAR,
  hrefDeTema,
  hrefTrasMostrar,
  leerIdeaMostrada,
} from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { cn } from "@/lib/utils"
import { AvisoDeIdeas } from "../../aviso-de-ideas"
import { BotonBorrar } from "../../boton-borrar"
import { BotonOcultar } from "../../boton-ocultar"
import { ListaDeIdeas } from "../../lista-de-ideas"
import { TrasElAviso } from "../../tras-el-aviso"
import { SinMaterial } from "../sin-material"
import { UnirAutores } from "./unir-autores"

/** One author (ported from Ingesta's `autores/[id]/page.tsx`): its ideas by topic, the hidden ones, and joining. */
export default async function DetalleDeAutor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, { id }, consulta] = await Promise.all([exigirConi(), params, searchParams])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const [leido, autores] = await Promise.all([leerAutor(db, valido.data), listarAutores(db)])
  if (!leido) notFound()
  const { autor, materiales, ideas, grupos, ocultas } = leido
  const cuentas = cuentasDeAutor({ materiales, ideas })

  const mostrada = leerIdeaMostrada(consulta) !== null
  // On a computer the ideas fill the main area in two columns and what she does with the author (its hidden ideas,
  // Unir, Borrar) goes to a 20rem panel. They already come last on a phone: each half is `contents` there, so the
  // phone keeps its one column in the same order (issue 103).
  return (
    <div className={cn("grid gap-6", PRINCIPAL_Y_PANEL)}>
      <div data-testid="pagina-principal" className="contents md:grid md:min-w-0 md:gap-6">
        <Volver href={RUTA_DE_AUTORES}>Autores</Volver>
        <header className={cn("grid gap-2", INTRO_DE_PAGINA)}>
          <h1 className="text-pantalla text-balance">{autor.nombre}</h1>
          <p className="text-meta text-apagado">{descripcionDeAutor(autor)}</p>
          {cuentas ? <p className="text-cuerpo">{cuentas}</p> : <SinMaterial />}
        </header>
        <AvisoDeIdeas texto={mostrada ? AVISO_TRAS_MOSTRAR : null} />
        {mostrada ? <TrasElAviso parametro="mostrada" /> : null}

        {grupos.map((grupo) => {
          const idDelTitulo = `grupo-${grupo.tema?.id ?? "sin-tema"}`
          return (
            <section key={idDelTitulo} aria-labelledby={idDelTitulo} className="grid gap-3">
              <h2 id={idDelTitulo} className="text-pieza text-balance">
                {grupo.tema ? (
                  <Link
                    href={hrefDeTema(grupo.tema.id)}
                    className="inline-flex min-h-objetivo items-center underline decoration-1 underline-offset-4"
                  >
                    {grupo.tema.nombre}
                  </Link>
                ) : (
                  "Sin tema todavía"
                )}
              </h2>
              <ListaDeIdeas
                etiqueta={grupo.tema ? `Ideas sobre ${grupo.tema.nombre}` : "Ideas sin tema todavía"}
                ideas={grupo.ideas}
                className="md:grid-cols-2"
              />
            </section>
          )
        })}
      </div>

      <div data-testid="pagina-panel" className="contents md:grid md:content-start md:gap-6">
        {ocultas.length > 0 ? (
          <MasOpciones titulo={`Ideas ocultas (${ocultas.length})`}>
            <div className="pb-4">
              <ListaDeIdeas
                etiqueta="Ideas ocultas"
                ideas={ocultas}
                accion={(idea) => <BotonOcultar ideaId={idea.id} oculta despues={hrefTrasMostrar(autor.id, idea.id)} />}
              />
            </div>
          </MasOpciones>
        ) : null}

        {sePuedeUnir(autor) ? (
          <UnirAutores
            origen={{ id: autor.id, nombre: autor.nombre }}
            otros={autores.filter((otro) => otro.id !== autor.id)}
          />
        ) : null}

        {sePuedeBorrarAutor(autor, { materiales, ideas, ocultas: ocultas.length }) ? (
          <BotonBorrar tipo="autor" id={autor.id} />
        ) : null}
      </div>
    </div>
  )
}
