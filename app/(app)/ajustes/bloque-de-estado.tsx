import { ArrowRight, CheckCircle, Info, Warning } from "@phosphor-icons/react/dist/ssr"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { estadoDeAjustes } from "@/lib/ajustes/estado"
import { cn } from "@/lib/utils"
import { revisionDeCuentas } from "./revision"

const ICONO = { configurando: Info, todo_bien: CheckCircle, atencion: Warning, sin_revision: Info } as const
const TINTA = {
  configurando: "text-tinta",
  todo_bien: "text-exito",
  atencion: "text-aviso",
  sin_revision: "text-tinta",
} as const

/**
 * The status of the setup (brandkit 9.21) as a status line with its steps. «aqui»: the block while something is missing
 * or needs her, on Ajustes; «todo_bien» is good news and lives with the accounts, so each page asks for its own half.
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
  const Icono = ICONO[bloque.tipo]

  return (
    <section aria-labelledby="estado-titulo" className="grid gap-4">
      <div className="grid grid-cols-[24px_1fr] gap-x-3 gap-y-1">
        <Icono aria-hidden="true" size={20} className={cn("mt-1 justify-self-center", TINTA[bloque.tipo])} />
        <h2 id="estado-titulo" className="text-cuerpo font-semibold">
          {bloque.titulo}
        </h2>
        {bloque.texto ? <p className="col-start-2 text-cuerpo">{bloque.texto}</p> : null}
      </div>
      {bloque.tipo === "configurando" ? (
        <ul className="grid">
          {bloque.pasos.map((paso) => (
            <li key={paso.etiqueta} className="flex min-h-12 items-center justify-between gap-3 border-b border-linea">
              {paso.etiqueta}
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-meta font-medium",
                  paso.listo ? "text-exito" : "text-aviso",
                )}
              >
                {paso.listo ? <CheckCircle aria-hidden="true" size={16} /> : <Warning aria-hidden="true" size={16} />}
                {paso.listo ? "Listo" : "Falta"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {bloque.accion ? (
        <a href={bloque.accion.href} className={clasesDeBoton({ variante: "primario", className: "mt-1" })}>
          {bloque.accion.etiqueta}
          <ArrowRight aria-hidden="true" size={20} />
        </a>
      ) : null}
    </section>
  )
}
