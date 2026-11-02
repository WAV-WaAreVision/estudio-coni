import Link from "next/link"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { RUTA_DE_LA_BIBLIOTECA } from "@/lib/sesion/rutas"

// Where /ir-a-biblioteca sends Coni when it cannot mint her link; the cause is already in the server log.
export default function BibliotecaNoAbrio() {
  return (
    <div className="grid gap-6 pt-6">
      <h1 className="text-pantalla">Biblioteca</h1>
      <LineaDeEstado
        tipo="error"
        titulo={<strong className="font-semibold">No pude abrir la Biblioteca.</strong>}
        tituloEnTinta
        detalle="Vuelve a intentarlo en un momento."
      />
      <div className="grid gap-2">
        {/* A plain link: a Next <Link> would prefetch the route handler and mint a link on every render. */}
        <a href={RUTA_DE_LA_BIBLIOTECA} className={clasesDeBoton({ variante: "primario" })}>
          Volver a intentar
        </a>
        <Link href="/" className={clasesDeBoton({ variante: "callado" })}>
          Ir a Inicio
        </Link>
      </div>
    </div>
  )
}
