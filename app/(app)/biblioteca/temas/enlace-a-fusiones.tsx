import Link from "next/link"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"
import { RUTA_DE_FUSIONES, TEXTOS_DE_FUSIONES } from "@/lib/dominio/fusiones"

/** Spec 2026-11-09: only while a merge waits for her, after the row, as the drafts link. */
export function EnlaceAFusiones({ cantidad }: { cantidad: number }) {
  if (cantidad === 0) return null
  return (
    <p>
      <Link
        href={RUTA_DE_FUSIONES}
        className="inline-flex min-h-objetivo items-center text-cuerpo font-semibold underline decoration-1 underline-offset-4"
      >
        {conCuenta(TEXTOS_DE_FUSIONES.titulo, cantidad)}
      </Link>
    </p>
  )
}
