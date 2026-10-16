"use client"

import { CaretRight } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { MouseEvent } from "react"
import { Seccion } from "@/components/seccion"
import { ICONO } from "@/components/ui/icono"
import type { Resultado } from "@/lib/acciones/resultado"

export interface AvisoParaMostrar {
  id: string
  mensaje: string
  /** The screen of the piece the notice is about, or `/`. */
  href: string
  cuando: string
}

/** "Avisos" in Inicio: what she has not opened yet. Tapping one marks it read and opens its piece. */
export function AvisosSinLeer({
  avisos,
  marcar,
}: {
  avisos: readonly AvisoParaMostrar[]
  marcar: (id: string) => Promise<Resultado>
}) {
  const router = useRouter()
  if (avisos.length === 0) return null

  async function abrir(evento: MouseEvent<HTMLAnchorElement>, aviso: AvisoParaMostrar) {
    evento.preventDefault()
    // Marking never stands between her and the piece: a failure is logged by the action and the notice stays unread.
    await marcar(aviso.id)
    router.push(aviso.href)
  }

  return (
    <Seccion titulo="Avisos" id="avisos-titulo" cifra={avisos.length}>
      <ul>
        {avisos.map((aviso) => (
          <li key={aviso.id} className="list-none">
            <Link
              href={aviso.href}
              onClick={(evento) => abrir(evento, aviso)}
              className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-3 border-b border-linea py-3 text-left last:border-b-0"
            >
              <span className="grid gap-0.5">
                <span className="text-cuerpo font-semibold tracking-[-0.004em]">{aviso.mensaje}</span>
                <span className="text-meta text-apagado">{aviso.cuando}</span>
              </span>
              <CaretRight aria-hidden="true" size={ICONO.medio} className="text-apagado" />
            </Link>
          </li>
        ))}
      </ul>
    </Seccion>
  )
}
