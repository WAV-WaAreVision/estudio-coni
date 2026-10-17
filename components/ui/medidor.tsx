import { Warning } from "@phosphor-icons/react/dist/ssr"
import { tonoDelMedidor } from "@/lib/diseno/medidor"
import { ICONO } from "./icono"
import { LineaDeEstado } from "./linea-de-estado"

interface PropiedadesDelMedidor {
  gastado: number
  tope: number
  /** «Llevas US$ 22,00 este mes»: the figure always goes in words, the bar is never the only signal. */
  texto: string
}

/** Decision 4: a sunken .625rem meter with an ink fill; from 80 percent the figure adds a warning icon, no colour. */
export function Medidor({ gastado, tope, texto }: PropiedadesDelMedidor) {
  const { tono, porcentaje, alTope } = tonoDelMedidor(gastado, tope)
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-meta font-medium text-tinta tabular-nums">
        {tono === "aviso" ? <Warning aria-hidden="true" size={ICONO.chico} /> : null}
        {texto}
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: a native meter cannot be drawn as a sunken rounded track on every browser. */}
      <div
        role="meter"
        aria-label="Gasto del mes"
        aria-valuemin={0}
        aria-valuemax={tope}
        aria-valuenow={gastado}
        aria-valuetext={texto}
        className="h-riel overflow-hidden rounded-control bg-piedra-honda shadow-hundido"
      >
        <div className="h-full rounded-control bg-tinta" style={{ width: `${porcentaje}%` }} />
      </div>
      {alTope ? <LineaDeEstado tipo="aviso" titulo="Llegaste al tope de gasto de este mes." /> : null}
    </div>
  )
}
