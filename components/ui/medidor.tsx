import { Warning } from "@phosphor-icons/react/dist/ssr"
import { tonoDelMedidor } from "@/lib/diseno/medidor"
import { cn } from "@/lib/utils"
import { LineaDeEstado } from "./linea-de-estado"

interface PropiedadesDelMedidor {
  gastado: number
  tope: number
  /** «Llevas US$ 22,00 este mes»: the figure always goes in words, the bar is never the only signal. */
  texto: string
}

/** Brandkit 9.15: a 4 px meter of the month's spend; from 80 percent of the cap it turns to aviso. */
export function Medidor({ gastado, tope, texto }: PropiedadesDelMedidor) {
  const { tono, porcentaje, alTope } = tonoDelMedidor(gastado, tope)
  const enAviso = tono === "aviso"
  return (
    <div className="grid gap-2">
      <p
        className={cn(
          "flex items-center gap-2 text-meta font-medium tabular-nums",
          enAviso ? "text-aviso" : "text-tinta",
        )}
      >
        {enAviso ? <Warning aria-hidden="true" size={16} /> : null}
        {texto}
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: a native meter cannot be drawn as a 4 px rounded track on every browser. */}
      <div
        role="meter"
        aria-label="Gasto del mes"
        aria-valuemin={0}
        aria-valuemax={tope}
        aria-valuenow={gastado}
        aria-valuetext={texto}
        className="h-1 overflow-hidden rounded-full bg-pista"
      >
        <div
          className={cn("h-full rounded-full", enAviso ? "bg-aviso" : "bg-tinta")}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      {alTope ? <LineaDeEstado tipo="aviso" titulo="Llegaste al tope de gasto de este mes." tituloEnTinta /> : null}
    </div>
  )
}
