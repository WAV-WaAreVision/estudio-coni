import { INTRO_DE_PAGINA } from "@/components/pagina-en-columnas"
import { Volver } from "@/components/ui/volver"
import { listarBorradores } from "@/lib/datos/borradores"
import { leerAviso } from "@/lib/dominio/biblioteca/borradores"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { porRed } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { cn } from "@/lib/utils"
import { AvisoDeIdeas } from "../../aviso-de-ideas"
import { TrasElAviso } from "../../tras-el-aviso"
import { TarjetaDeBorradorDePilar, TarjetaDeBorradorDeRed } from "./tarjetas-de-borrador"

/** The drafts side by side wherever there is room (at least 20rem each, or the whole column if narrower) on a computer; one column on a phone. */
const TARJETAS = "grid gap-3 md:grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))]"

/** Spec 15c: the drafts that wait, pillars by network and then networks; approving is a second, separate step. */
export default async function Borradores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const { pilares, redes } = await listarBorradores(db)
  const aviso = leerAviso(params)
  const ambos = pilares.length > 0 && redes.length > 0
  // On a computer the pillars (by network) and the networks sit side by side from lg, two thirds and one third, each a grid
  // of cards; on a phone both wrappers are `contents` and the page keeps its one column (issue 103).
  return (
    <div className="grid gap-6">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <h1 className="text-pantalla">Borradores</h1>
      <AvisoDeIdeas texto={aviso} />
      {aviso ? <TrasElAviso parametro="aviso" /> : null}
      {pilares.length === 0 && redes.length === 0 ? (
        <p className={cn("text-cuerpo text-apagado", INTRO_DE_PAGINA)}>
          No tienes borradores. Agrega un pilar o una red desde Temas.
        </p>
      ) : null}
      <div
        className={cn(
          "contents md:grid md:items-start md:gap-x-8 md:gap-y-6 lg:gap-x-12",
          ambos && "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
        )}
      >
        <div className="contents md:grid md:min-w-0 md:gap-6 md:empty:hidden">
          {porRed(pilares).map((grupo) => {
            const idDelTitulo = `borradores-${grupo.red ?? "sin-red"}`
            return (
              <section key={idDelTitulo} aria-labelledby={idDelTitulo} className="grid gap-3">
                <h2 id={idDelTitulo} className="text-pieza">
                  {`Pilares de ${grupo.etiqueta}`}
                </h2>
                <ul className={TARJETAS}>
                  {grupo.pilares.map((borrador) => (
                    <li key={borrador.id}>
                      <TarjetaDeBorradorDePilar borrador={borrador} />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
        {redes.length > 0 ? (
          <section aria-labelledby="borradores-redes" className="grid min-w-0 gap-3">
            <h2 id="borradores-redes" className="text-pieza">
              Redes
            </h2>
            <ul className={TARJETAS}>
              {redes.map((borrador) => (
                <li key={borrador.id}>
                  <TarjetaDeBorradorDeRed borrador={borrador} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
