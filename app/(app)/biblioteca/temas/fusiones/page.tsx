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

/** Cards side by side wherever there is room on a computer (at least 20rem each), one column on a phone (as Borradores). */
const TARJETAS = "grid gap-3 md:grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))]"

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
  return (
    <div className="grid gap-6">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <h1 className="text-pantalla">{TEXTOS_DE_FUSIONES.titulo}</h1>
      <AvisoDeIdeas texto={aviso} />
      {params.aviso === undefined ? null : <TrasElAviso parametro="aviso" />}
      {vacia ? <p className={cn("text-cuerpo text-apagado", INTRO_DE_PAGINA)}>{TEXTOS_DE_FUSIONES.vacio}</p> : null}
      {/* Sections inline (not a helper component), so the page test reads each h2's text in the tree. */}
      {propuestas.length > 0 ? (
        <section aria-labelledby="fusiones-propuestas" className="grid gap-3">
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
      {recientes.length > 0 ? (
        <section aria-labelledby="fusiones-recientes" className="grid gap-3">
          <h2 id="fusiones-recientes" className="text-pieza">
            {TEXTOS_DE_FUSIONES.recientes}
          </h2>
          <ul className={TARJETAS}>
            {recientes.map((fusion) => (
              <li key={fusion.id}>
                <TarjetaDeFusionReciente fusion={fusion} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rechazadas.length > 0 ? (
        <section aria-labelledby="fusiones-rechazadas" className="grid gap-3">
          <h2 id="fusiones-rechazadas" className="text-pieza">
            {TEXTOS_DE_FUSIONES.rechazadas}
          </h2>
          <ul className={TARJETAS}>
            {rechazadas.map((par) => (
              <li key={`${par.a}-${par.b}`}>
                <TarjetaDeParRechazado par={par} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
