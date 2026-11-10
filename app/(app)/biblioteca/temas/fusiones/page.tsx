import { INTRO_DE_PAGINA } from "@/components/pagina-en-columnas"
import { Volver } from "@/components/ui/volver"
import { leerFusiones } from "@/lib/datos/fusiones"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { leerAvisoDeFusion, TEXTOS_DE_FUSIONES } from "@/lib/dominio/fusiones"
import { exigirConi } from "@/lib/sesion/coni"
import { cn } from "@/lib/utils"
import { AvisoDeIdeas } from "../../aviso-de-ideas"
import { TrasElAviso } from "../../tras-el-aviso"
import { TarjetaDeFusionReciente, TarjetaDeParRechazado, TarjetaDePropuesta } from "./tarjetas-de-fusion"

/**
 * Cards side by side wherever there is room on a computer (20rem to 40rem each, a reading width), one column on a phone.
 * auto-fit, not auto-fill: a lone card grows to 40rem instead of keeping a third of the column.
 */
const TARJETAS = "grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),40rem))]"
/** In the side column (lg) the recent merges and the pairs not merged go one card under the other. */
const TARJETAS_AL_LADO = "grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),40rem))] lg:grid-cols-1"

/** Spec 2026-11-09 (issue 22): what waits for her, what was merged lately (with Deshacer) and the pairs not merged. */
export default async function Fusiones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const { propuestas, recientes, rechazadas } = await leerFusiones(db, Date.now())
  const aviso = leerAvisoDeFusion(params)
  const vacia = propuestas.length + recientes.length + rechazadas.length === 0
  const historial = recientes.length > 0 || rechazadas.length > 0
  const alLado = propuestas.length > 0 && historial
  // On a computer (lg) what waits for her takes the wide column and the history (recent merges, pairs not merged) sits
  // stacked on its right, three fifths and two fifths; with nothing to decide the two lists share the width instead. On
  // a phone both wrappers are `contents` and the page keeps its one column (as Borradores, issue 103).
  return (
    <div className="grid gap-6">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <h1 className="text-pantalla">{TEXTOS_DE_FUSIONES.titulo}</h1>
      <AvisoDeIdeas texto={aviso} />
      {params.aviso === undefined ? null : <TrasElAviso parametro="aviso" />}
      {vacia ? <p className={cn("text-cuerpo text-apagado", INTRO_DE_PAGINA)}>{TEXTOS_DE_FUSIONES.vacio}</p> : null}
      {/* Sections inline (not a helper component), so the page test reads each h2's text in the tree. */}
      <div
        className={cn(
          "contents md:grid md:items-start md:gap-x-8 md:gap-y-6 lg:gap-x-12",
          alLado && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
          propuestas.length === 0 && recientes.length > 0 && rechazadas.length > 0 && "lg:grid-cols-2",
        )}
      >
        {propuestas.length > 0 ? (
          <section aria-labelledby="fusiones-propuestas" className="grid min-w-0 gap-3">
            <h2 id="fusiones-propuestas" className="text-pieza">
              {TEXTOS_DE_FUSIONES.propuestas}
            </h2>
            <ul className={TARJETAS}>
              {propuestas.map((propuesta) => (
                <li key={propuesta.id}>
                  <TarjetaDePropuesta propuesta={propuesta} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className={cn("contents", alLado && "md:grid md:min-w-0 md:gap-6")}>
          {recientes.length > 0 ? (
            <section aria-labelledby="fusiones-recientes" className="grid min-w-0 gap-3">
              <h2 id="fusiones-recientes" className="text-pieza">
                {TEXTOS_DE_FUSIONES.recientes}
              </h2>
              <ul className={alLado ? TARJETAS_AL_LADO : TARJETAS}>
                {recientes.map((fusion) => (
                  <li key={fusion.id}>
                    <TarjetaDeFusionReciente fusion={fusion} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {rechazadas.length > 0 ? (
            <section aria-labelledby="fusiones-rechazadas" className="grid min-w-0 gap-3">
              <h2 id="fusiones-rechazadas" className="text-pieza">
                {TEXTOS_DE_FUSIONES.rechazadas}
              </h2>
              <ul className={alLado ? TARJETAS_AL_LADO : TARJETAS}>
                {rechazadas.map((par) => (
                  <li key={`${par.a}-${par.b}`}>
                    <TarjetaDeParRechazado par={par} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
