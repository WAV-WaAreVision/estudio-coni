import { Check } from "@phosphor-icons/react/dist/ssr"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { type BloqueDeEstado as Bloque, estadoDeAjustes } from "@/lib/ajustes/estado"
import { cn } from "@/lib/utils"
import { revisionDeCuentas } from "./revision"

const FONDO: Record<Bloque["tipo"], string> = {
  configurando: "border border-linea bg-superficie text-tinta",
  todo_bien: "bg-ok-fondo text-ok-tinta",
  atencion: "bg-aviso-fondo text-aviso-tinta",
  sin_revision: "bg-hundido text-tinta",
}

/** The block on top of Ajustes (docs/DESIGN.md, status-block): setting up, all good, or something needs her. */
export async function BloqueDeEstado({ zona, avisosActivos }: { zona: string; avisosActivos: boolean }) {
  const bloque = estadoDeAjustes({ cuentas: await revisionDeCuentas(), avisosActivos, ahora: Date.now(), zona })

  return (
    <section aria-labelledby="estado-titulo" className={cn("grid gap-2.5 rounded-lg p-4.5", FONDO[bloque.tipo])}>
      <h2 id="estado-titulo" className="text-[1.25rem] font-semibold text-tinta">
        {bloque.titulo}
      </h2>
      {bloque.texto ? <p>{bloque.texto}</p> : null}
      {bloque.tipo === "configurando" ? (
        <ul className="grid">
          {bloque.pasos.map((paso) => (
            <li
              key={paso.etiqueta}
              className="flex min-h-12 items-center justify-between gap-3 border-b border-linea text-tinta last:border-b-0"
            >
              {paso.etiqueta}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label font-semibold",
                  paso.listo ? "bg-ok-fondo text-ok-tinta" : "bg-aviso-fondo text-aviso-tinta",
                )}
              >
                {paso.listo ? <Check aria-hidden="true" size={14} /> : null}
                {paso.listo ? "Listo" : "Falta"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {bloque.accion ? (
        <a href={bloque.accion.href} className={clasesDeBoton({ variante: "primario", className: "mt-1" })}>
          {bloque.accion.etiqueta}
        </a>
      ) : null}
    </section>
  )
}
