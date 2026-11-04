import Link from "next/link"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { type AutorResumido, descripcionDeAutor, hrefDeAutor, RUTA_DE_AUTORES } from "@/lib/dominio/biblioteca/autores"
import { cuentasDeAutor } from "@/lib/dominio/biblioteca/cuentas"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { SinMaterial } from "./sin-material"

/** The computer's side panel of an author, built from the list already read (D4). */
export function PanelDeAutor({ autor }: { autor: AutorResumido }) {
  const cuentas = cuentasDeAutor(autor)
  return (
    <section aria-labelledby="panel-titulo" className="grid gap-6 rounded-panel bg-piedra-alta p-5">
      <p className="text-meta text-apagado">{descripcionDeAutor(autor)}</p>
      <h2 id="panel-titulo" tabIndex={-1} className="text-pieza text-balance">
        {autor.nombre}
      </h2>
      {cuentas ? <p className="text-cuerpo">{cuentas}</p> : <SinMaterial />}
      {autor.temas.length > 0 ? (
        <Seccion titulo="Temas" id="panel-temas" espacio="ninguno" nivel={3}>
          <ul className="grid">
            {autor.temas.map((tema) => (
              <li key={tema.id}>
                <Link href={hrefDeTema(tema.id)} className={clasesDeBoton({ variante: "callado" })}>
                  {tema.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}
      <Link href={hrefDeAutor(autor.id)} className={clasesDeBoton({ variante: "callado" })}>
        {`Ver todo de ${autor.nombre}`}
      </Link>
      <Link
        href={RUTA_DE_AUTORES}
        scroll={false}
        data-cierra-panel={autor.id}
        className={clasesDeBoton({ variante: "callado" })}
      >
        Cerrar el panel
      </Link>
    </section>
  )
}
