import { ArrowRight, CheckCircle, Info, Warning } from "@phosphor-icons/react/dist/ssr"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { PildoraDeEstado } from "@/components/ui/estado"
import { ICONO } from "@/components/ui/icono"
import { estadoDeAjustes } from "@/lib/ajustes/estado"
import { revisionDeCuentas } from "./revision"

const ICONOS = { configurando: Info, todo_bien: CheckCircle, atencion: Warning, sin_revision: Info } as const

/**
 * The status of the setup as a flat honda block with its steps (decision 12). «pendiente»: the block while something
 * is missing or needs her, on Ajustes; «bueno» is good news and lives with the accounts, so each page asks for its half.
 */
export async function BloqueDeEstado({
  zona,
  avisosActivos,
  mostrar,
}: {
  zona: string
  avisosActivos: boolean
  mostrar: "pendiente" | "bueno"
}) {
  const bloque = estadoDeAjustes({ cuentas: await revisionDeCuentas(), avisosActivos, ahora: Date.now(), zona })
  if ((bloque.tipo === "todo_bien") !== (mostrar === "bueno")) return null
  const Icono = ICONOS[bloque.tipo]

  return (
    <section
      aria-labelledby="estado-titulo"
      data-contorno
      className="grid gap-4 rounded-bloque bg-piedra-honda px-[14px] py-3"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1">
        <Icono aria-hidden="true" size={ICONO.medio} className="mt-0.5 text-tinta" />
        <h2 id="estado-titulo" className="text-cuerpo font-semibold">
          {bloque.titulo}
        </h2>
        {bloque.texto ? <p className="col-start-2 text-meta">{bloque.texto}</p> : null}
      </div>
      {bloque.tipo === "configurando" ? (
        <ul className="grid divide-y divide-campo/30">
          {bloque.pasos.map((paso) => (
            <li key={paso.etiqueta} className="flex min-h-boton items-center justify-between gap-3 text-meta">
              {paso.etiqueta}
              <PildoraDeEstado tipo={paso.listo ? "ok" : "aviso"} className="bg-piedra">
                {paso.listo ? "Listo" : "Falta"}
              </PildoraDeEstado>
            </li>
          ))}
        </ul>
      ) : null}
      {bloque.accion ? (
        <a href={bloque.accion.href} className={clasesDeBoton({ variante: "primario", className: "mt-1" })}>
          {bloque.accion.etiqueta}
          <ArrowRight aria-hidden="true" size={ICONO.grande} />
        </a>
      ) : null}
    </section>
  )
}
