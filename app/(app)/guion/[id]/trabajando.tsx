import { PuntoTrabajando } from "@/components/ui/punto-trabajando"

/** A piece being worked on (v6 `.trabajando`): the working dot, what is happening, and when she will hear about it. */
export function Trabajando({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="grid gap-1.5">
      <output className="flex items-center gap-3 text-boton font-semibold">
        <PuntoTrabajando />
        {titulo}
      </output>
      <p className="text-meta text-apagado">{detalle}</p>
    </div>
  )
}
