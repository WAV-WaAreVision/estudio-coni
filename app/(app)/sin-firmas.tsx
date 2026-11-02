import Link from "next/link"

/**
 * Inicio when nothing waits for her signature. The weekly engine runs on Sundays at 20:00 in Santiago
 * (trigger/motor-semanal.ts); when she turned it off, nothing is promised and she is told where to turn it on.
 */
export function SinFirmas({ motorSemanalActivo }: { motorSemanalActivo: boolean }) {
  return (
    <div className="grid gap-1 py-1">
      <p className="text-cuerpo font-semibold">Nada espera tu firma esta semana.</p>
      {motorSemanalActivo ? (
        <p className="text-cuerpo text-apagado">El domingo a las 20:00 te propongo ideas nuevas.</p>
      ) : (
        <p className="text-cuerpo text-apagado">
          Las ideas nuevas de cada domingo están apagadas. Puedes encenderlas en{" "}
          <Link href="/ajustes/presupuesto" className="text-tinta underline decoration-1 underline-offset-4">
            Ajustes › Presupuesto
          </Link>
          .
        </p>
      )}
    </div>
  )
}
