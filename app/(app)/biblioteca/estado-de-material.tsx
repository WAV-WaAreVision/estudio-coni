import { HandPalm, HourglassMedium, PauseCircle } from "@phosphor-icons/react/dist/ssr"
import { PildoraDeEstado } from "@/components/ui/estado"
import { ICONO } from "@/components/ui/icono"
import { type EstadoDeProceso, presentarEstado } from "@/lib/dominio/biblioteca/estado"

const ICONOS = { reloj: HourglassMedium, pausa: PauseCircle, mano: HandPalm } as const

/** The state of a material as a word with its icon (4j); the pill draws check and warning circle itself. */
export function EstadoDeMaterial({ material }: { material: EstadoDeProceso }) {
  const { palabra, tipo, icono } = presentarEstado(material)
  const Icono = icono ? ICONOS[icono] : null
  return (
    <PildoraDeEstado
      tipo={tipo}
      icono={Icono ? <Icono aria-hidden="true" size={ICONO.chico} weight="bold" className="shrink-0" /> : undefined}
    >
      {palabra}
    </PildoraDeEstado>
  )
}
