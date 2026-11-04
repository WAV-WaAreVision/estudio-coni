import Link from "next/link"
import { RUTA_DE_SUBIR } from "@/lib/dominio/biblioteca/borrador-de-subida"

/** An author with no material and no idea (4i): instead of zeros, the way to give it some. */
export function SinMaterial() {
  return (
    <p className="text-meta text-apagado">
      Todavía no hay material de esta persona. Súbelo desde{" "}
      <Link href={RUTA_DE_SUBIR} className="font-semibold text-tinta underline decoration-1 underline-offset-4">
        Subir
      </Link>
      .
    </p>
  )
}
