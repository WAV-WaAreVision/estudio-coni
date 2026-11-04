import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { cuentasDeTema } from "@/lib/dominio/biblioteca/cuentas"
import { type FiltrosDeTemas, hrefDeTema, hrefDeTemas } from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"
import { Insignias } from "./insignias"

/** The computer's side panel of a topic, built from the list already read (D4); closing keeps the filters. */
export function PanelDeTema({ tema, filtros }: { tema: TemaResumido; filtros: FiltrosDeTemas }) {
  return (
    <section aria-labelledby="panel-titulo" className="grid gap-6 rounded-panel bg-piedra-alta p-5">
      <h2 id="panel-titulo" tabIndex={-1} className="text-pieza text-balance">
        {tema.nombre}
      </h2>
      {tema.descripcion ? <p className="text-cuerpo">{tema.descripcion}</p> : null}
      <p className="text-meta text-apagado">{cuentasDeTema(tema)}</p>
      <Insignias tema={tema} />
      <Link href={hrefDeTema(tema.id)} className={clasesDeBoton({ variante: "callado" })}>
        Ver sus ideas
      </Link>
      <Link
        href={hrefDeTemas(filtros)}
        scroll={false}
        data-cierra-panel={tema.id}
        className={clasesDeBoton({ variante: "callado" })}
      >
        Cerrar el panel
      </Link>
    </section>
  )
}
