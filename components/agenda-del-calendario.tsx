import Link from "next/link"
import type { Hueco, Ocupante, TonoDeEstado } from "@/lib/calendario/modelo"
import { NOMBRE_DE_PILAR } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

const TONO: Record<TonoDeEstado, string> = {
  ok: "bg-ok-fondo text-ok-tinta",
  aviso: "bg-aviso-fondo text-aviso-tinta",
  error: "bg-error-fondo text-error-tinta",
  neutro: "text-apagado",
}

function Estado({ ocupante }: { ocupante: Ocupante }) {
  return (
    <span
      className={cn("w-fit rounded-full text-label", ocupante.tono !== "neutro" && "px-2.5 py-1", TONO[ocupante.tono])}
    >
      {ocupante.estado}
      {ocupante.provisional && ocupante.tono === "neutro" ? " · lugar propuesto" : ""}
    </span>
  )
}

function Ocupado({ ocupante }: { ocupante: Ocupante }) {
  const contenido = (
    <>
      <span className="text-body font-semibold leading-[1.3]">{ocupante.titulo}</span>
      {ocupante.pilar ? <span className="text-meta text-pilar-tinta">{NOMBRE_DE_PILAR[ocupante.pilar]}</span> : null}
      <Estado ocupante={ocupante} />
    </>
  )
  const clases = cn("grid gap-1.5 rounded-sm p-3 text-left", ocupante.pilar ? "bg-pilar-tinte" : "bg-hundido")
  return ocupante.href ? (
    <Link
      href={ocupante.href}
      data-pilar={ocupante.pilar ?? undefined}
      className={cn(clases, "transition-opacity duration-150 ease-out active:opacity-80 motion-reduce:transition-none")}
    >
      {contenido}
    </Link>
  ) : (
    <div data-pilar={ocupante.pilar ?? undefined} className={clases}>
      {contenido}
    </div>
  )
}

/** Free slots go to the idea bank: "Libre · elige una idea" (DESIGN.md, Fila de horario). */
function FilaDeHorario({ hueco }: { hueco: Hueco }) {
  return (
    <li className="grid grid-cols-[4.5rem_1fr] items-start gap-3 border-b border-linea py-3 last:border-b-0">
      <span className="grid text-label font-semibold leading-tight">
        {hueco.dia}
        <small className="font-medium text-apagado">{hueco.hora}</small>
      </span>
      {hueco.ocupante ? (
        <Ocupado ocupante={hueco.ocupante} />
      ) : (
        <Link
          href="/ideas"
          className="flex min-h-11 items-center rounded-sm border-[1.5px] border-linea border-dashed px-3 py-2.5 text-apagado transition-colors duration-150 ease-out active:bg-hundido motion-reduce:transition-none"
        >
          Libre · elige una idea
        </Link>
      )}
    </li>
  )
}

export function AgendaDelCalendario({ semanas }: { semanas: { titulo: string; huecos: readonly Hueco[] }[] }) {
  return (
    <div className="grid gap-5">
      {semanas.map((semana) => (
        <section key={semana.titulo} aria-label={semana.titulo} className="grid gap-0.5">
          <h2 className="text-label font-semibold">{semana.titulo}</h2>
          {semana.huecos.length > 0 ? (
            <ul>
              {semana.huecos.map((hueco) => (
                <FilaDeHorario key={hueco.instante} hueco={hueco} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-meta text-apagado">Sin espacios de publicación en lo que queda de esta semana.</p>
          )}
        </section>
      ))}
    </div>
  )
}
