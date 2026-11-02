"use client"

import { useRouter } from "next/navigation"
import { Chip } from "@/components/chip"
import { type EstadoDeMaterial, type FiltrosDeMateriales, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"

interface Propiedades {
  filtros: FiltrosDeMateriales
  conteos: { procesando: number; fallido: number }
}

/** A count only when there is something to count (4i): "Procesando · 2", or just "Procesando". */
const conCuenta = (texto: string, cantidad: number) => (cantidad > 0 ? `${texto} · ${cantidad}` : texto)

/** Fix 4b: one tap per state; the state lives in the URL, the other filters stay as they were. */
export function FiltrosRapidos({ filtros, conteos }: Propiedades) {
  const router = useRouter()
  const opciones: { estado: EstadoDeMaterial | undefined; texto: string }[] = [
    { estado: undefined, texto: "Todos" },
    { estado: "procesando", texto: conCuenta("Procesando", conteos.procesando) },
    { estado: "listo", texto: "Listos" },
    { estado: "fallido", texto: conCuenta("Con error", conteos.fallido) },
  ]
  return (
    <fieldset aria-label="Filtrar por estado" className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      {opciones.map(({ estado, texto }) => (
        <Chip
          key={estado ?? "todos"}
          presionado={filtros.estado === estado}
          onClick={() => router.replace(hrefDeLista({ ...filtros, estado }), { scroll: false })}
        >
          {texto}
        </Chip>
      ))}
    </fieldset>
  )
}
