import { CaretLeft } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import type { ReactNode } from "react"
import { ICONO } from "./icono"

/** Decision 4: the way back is touchable, so it is raised; a back button that is not a link uses the same classes. */
export const CLASES_DE_VOLVER =
  "inline-flex min-h-objetivo w-fit items-center gap-1.5 rounded-control bg-piedra pr-[18px] pl-3 text-cuerpo font-semibold text-tinta shadow-relieve transition-shadow duration-[var(--dur-corta)] ease-salida active:shadow-hundido"

export function Volver({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={CLASES_DE_VOLVER}>
      <CaretLeft aria-hidden="true" size={ICONO.medio} />
      {children}
    </Link>
  )
}
