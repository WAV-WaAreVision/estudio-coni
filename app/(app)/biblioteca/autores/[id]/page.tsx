import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Volver } from "@/components/ui/volver"
import { leerAutor, listarAutores } from "@/lib/datos/biblioteca"
import { descripcionDeAutor, RUTA_DE_AUTORES, sePuedeUnir } from "@/lib/dominio/biblioteca/autores"
import { cuentasDeAutor } from "@/lib/dominio/biblioteca/cuentas"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { exigirConi } from "@/lib/sesion/coni"
import { BotonOcultar } from "../../boton-ocultar"
import { ListaDeIdeas } from "../../lista-de-ideas"
import { SinMaterial } from "../sin-material"
import { UnirAutores } from "./unir-autores"

/** One author (ported from Ingesta's `autores/[id]/page.tsx`): its ideas by topic, the hidden ones, and joining. */
export default async function DetalleDeAutor({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const [leido, autores] = await Promise.all([leerAutor(db, valido.data), listarAutores(db)])
  if (!leido) notFound()
  const { autor, materiales, ideas, grupos, ocultas } = leido
  const cuentas = cuentasDeAutor({ materiales, ideas })

  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_AUTORES}>Autores</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">{autor.nombre}</h1>
        <p className="text-meta text-apagado">{descripcionDeAutor(autor)}</p>
        {cuentas ? <p className="text-cuerpo">{cuentas}</p> : <SinMaterial />}
      </header>

      {grupos.map((grupo) => {
        const idDelTitulo = `grupo-${grupo.tema?.id ?? "sin-tema"}`
        return (
          <section key={idDelTitulo} aria-labelledby={idDelTitulo} className="grid gap-3">
            <h2 id={idDelTitulo} className="text-pieza text-balance">
              {grupo.tema ? (
                <Link href={hrefDeTema(grupo.tema.id)} className="underline decoration-1 underline-offset-4">
                  {grupo.tema.nombre}
                </Link>
              ) : (
                "Sin tema todavía"
              )}
            </h2>
            <ListaDeIdeas
              etiqueta={grupo.tema ? `Ideas sobre ${grupo.tema.nombre}` : "Ideas sin tema todavía"}
              ideas={grupo.ideas}
            />
          </section>
        )
      })}

      {ocultas.length > 0 ? (
        <MasOpciones titulo={`Ideas ocultas (${ocultas.length})`}>
          <div className="pb-4">
            <ListaDeIdeas
              etiqueta="Ideas ocultas"
              ideas={ocultas}
              accion={(idea) => <BotonOcultar ideaId={idea.id} oculta despues={null} />}
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
    </div>
  )
}
