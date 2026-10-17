import { CaretRight, CheckCircle, Export, PenNib, WarningCircle } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Seccion } from "@/components/seccion"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { PuntoTrabajando } from "@/components/ui/punto-trabajando"
import type { Hueco, Ocupante, TonoDeEstado } from "@/lib/calendario/modelo"
import { NOMBRE_DE_PILAR } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

// Decision 14: a state is its icon and its words, in ink (The No Yellow Rule).
const TINTA: Record<TonoDeEstado, string> = {
  ok: "text-tinta",
  aviso: "text-tinta",
  error: "text-tinta",
  neutro: "text-tinta",
}

/** The state always has its icon in its ink: «Programado» check, «Para subir» export, «Falta tu firma» pen, a failure warning. */
function IconoDeEstado({ ocupante }: { ocupante: Ocupante }) {
  if (ocupante.tono === "ok") return <CheckCircle aria-hidden="true" size={ICONO.chico} />
  if (ocupante.tono === "error") return <WarningCircle aria-hidden="true" size={ICONO.chico} />
  if (ocupante.tono === "aviso")
    return ocupante.estado.startsWith("Para subir") ? (
      <Export aria-hidden="true" size={ICONO.chico} />
    ) : (
      <PenNib aria-hidden="true" size={ICONO.chico} />
    )
  return ocupante.href === null && ocupante.estado.startsWith("Grabando") ? <PuntoTrabajando /> : null
}

function Ocupado({ ocupante }: { ocupante: Ocupante }) {
  return (
    <span className="grid gap-0.5">
      {ocupante.pilar ? <span className="text-meta text-apagado">{NOMBRE_DE_PILAR[ocupante.pilar]}</span> : null}
      <span className="text-cuerpo leading-[1.3] font-semibold">{ocupante.titulo}</span>
      <span data-snapshot="varia" className={cn("flex items-center gap-2 text-meta font-medium", TINTA[ocupante.tono])}>
        <IconoDeEstado ocupante={ocupante} />
        {ocupante.estado}
        {ocupante.provisional ? " · lugar propuesto" : ""}
      </span>
      {ocupante.destinos ? <span className="text-meta text-apagado">{ocupante.destinos}</span> : null}
    </span>
  )
}

const FILA = "grid min-h-fila grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-3 py-3 text-left"

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
      {destino ? <CaretRight aria-hidden="true" size={ICONO.medio} className="text-apagado" /> : <span />}
    </>
  )
  return (
    <li className="list-none">
      {destino ? (
        <Link
          href={destino}
          className={cn(FILA, "transition-colors duration-[var(--dur-corta)] active:bg-piedra-honda")}
        >
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
            <Grupo lista>
              {semana.huecos.map((hueco) => (
                <FilaDeHorario key={hueco.instante} hueco={hueco} />
              ))}
            </Grupo>
          ) : (
            <p className="py-2 text-meta text-apagado">Sin espacios de publicación en lo que queda de esta semana.</p>
          )}
        </Seccion>
      ))}
    </div>
  )
}
