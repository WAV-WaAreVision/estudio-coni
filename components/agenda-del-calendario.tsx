import { CaretRight, CheckCircle, Export, PenNib, WarningCircle } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Seccion } from "@/components/seccion"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import type { Hueco, Ocupante, TonoDeEstado } from "@/lib/calendario/modelo"
import { NOMBRE_DE_PILAR } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

const TINTA: Record<TonoDeEstado, string> = {
  ok: "text-exito",
  aviso: "text-aviso",
  error: "text-error",
  neutro: "text-tinta",
}

/** The state always has its icon in its ink: «Programado» check, «Para subir» export, «Falta tu firma» pen, a failure warning. */
function IconoDeEstado({ ocupante }: { ocupante: Ocupante }) {
  if (ocupante.tono === "ok") return <CheckCircle aria-hidden="true" size={16} />
  if (ocupante.tono === "error") return <WarningCircle aria-hidden="true" size={16} />
  if (ocupante.tono === "aviso")
    return ocupante.estado.startsWith("Para subir") ? (
      <Export aria-hidden="true" size={16} />
    ) : (
      <PenNib aria-hidden="true" size={16} />
    )
  return ocupante.href === null && ocupante.estado.startsWith("Grabando") ? <PuntoTrabajando /> : null
}

function Ocupado({ ocupante }: { ocupante: Ocupante }) {
  return (
    <span className="grid gap-0.5">
      {ocupante.pilar ? <span className="text-meta text-apagado">{NOMBRE_DE_PILAR[ocupante.pilar]}</span> : null}
      <span className="text-cuerpo font-semibold tracking-[-0.004em]">{ocupante.titulo}</span>
      <span data-snapshot="varia" className={cn("flex items-center gap-2 text-meta font-medium", TINTA[ocupante.tono])}>
        <IconoDeEstado ocupante={ocupante} />
        {ocupante.estado}
        {ocupante.provisional ? " · lugar propuesto" : ""}
      </span>
      {ocupante.destinos ? <span className="text-meta text-apagado">{ocupante.destinos}</span> : null}
    </span>
  )
}

const FILA =
  "grid min-h-16 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-linea py-3 text-left"

/** Brandkit 9.19: a free slot goes to the idea bank: «Libre · elige una idea». */
function FilaDeHorario({ hueco }: { hueco: Hueco }) {
  const fecha = (
    <span data-snapshot="varia" className="grid self-start text-meta leading-tight">
      <span className="font-semibold">{hueco.dia}</span>
      <span className="text-apagado tabular-nums">{hueco.hora}</span>
    </span>
  )
  const destino = hueco.ocupante?.href ?? (hueco.ocupante ? null : "/ideas")
  const contenido = (
    <>
      {fecha}
      {hueco.ocupante ? (
        <Ocupado ocupante={hueco.ocupante} />
      ) : (
        <span className="text-cuerpo font-medium text-apagado">Libre · elige una idea</span>
      )}
      {destino ? <CaretRight aria-hidden="true" size={20} className="text-apagado" /> : <span />}
    </>
  )
  return (
    <li className="list-none">
      {destino ? (
        <Link href={destino} className={cn(FILA, "active:opacity-70")}>
          {contenido}
        </Link>
      ) : (
        <div className={FILA}>{contenido}</div>
      )}
    </li>
  )
}

export function AgendaDelCalendario({ semanas }: { semanas: { titulo: string; huecos: readonly Hueco[] }[] }) {
  return (
    <div>
      {semanas.map((semana) => (
        <Seccion key={semana.titulo} titulo={semana.titulo} varia id={`semana-${semana.titulo.replaceAll(" ", "-")}`}>
          {semana.huecos.length > 0 ? (
            <ul>
              {semana.huecos.map((hueco) => (
                <FilaDeHorario key={hueco.instante} hueco={hueco} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-meta text-apagado">Sin espacios de publicación en lo que queda de esta semana.</p>
          )}
        </Seccion>
      ))}
    </div>
  )
}
