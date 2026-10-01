import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type TipoDeNota = "ok" | "error" | "ocupada" | "aviso"

const CLASES: Record<TipoDeNota, string> = {
  ok: "bg-ok-fondo text-ok-tinta",
  error: "bg-error-fondo text-error-tinta",
  ocupada: "bg-hundido text-tinta",
  aviso: "bg-aviso-fondo text-aviso-tinta",
}

interface PropiedadesDeNota {
  tipo: TipoDeNota
  titulo: string
  children?: ReactNode
  className?: string
}

/** A block that says what happened and, when there is one, what to do about it. Errors interrupt (alert); the rest wait. */
export function Nota({ tipo, titulo, children, className }: PropiedadesDeNota) {
  const contenido = (
    <>
      <p className="font-semibold text-tinta">{titulo}</p>
      {children}
    </>
  )
  const clases = cn("grid gap-1.5 rounded-lg p-4 text-[1.0625rem]", CLASES[tipo], className)
  return tipo === "error" ? (
    <div role="alert" className={clases}>
      {contenido}
    </div>
  ) : (
    <output className={clases}>{contenido}</output>
  )
}
