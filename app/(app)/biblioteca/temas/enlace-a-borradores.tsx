import Link from "next/link"
import { RUTA_DE_BORRADORES } from "@/lib/dominio/biblioteca/borradores"
import { conCuenta } from "@/lib/dominio/biblioteca/cuentas"

/** Spec 15c: after the row, only while drafts wait. It filters nothing, so it lives outside the row's group. */
export function EnlaceABorradores({ cantidad }: { cantidad: number }) {
  if (cantidad === 0) return null
  return (
    <p>
      <Link
        href={RUTA_DE_BORRADORES}
        className="inline-flex min-h-objetivo items-center text-cuerpo font-semibold underline decoration-1 underline-offset-4"
      >
        {conCuenta("Borradores", cantidad)}
      </Link>
    </p>
  )
}
