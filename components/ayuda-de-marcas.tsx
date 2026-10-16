import { CaretDown } from "@phosphor-icons/react/dist/ssr"
import { ICONO } from "@/components/ui/icono"
import { ETIQUETAS_DE_TONO } from "@/lib/dominio/etiquetas"

export const AYUDA_DE_MARCAS = "Lo que va entre corchetes marca el tono de la voz. No se lee ni sale en los subtítulos."

/** Under the script: what the brackets do, and (folded) the list the "no la conozco" warning points to. */
export function AyudaDeMarcas() {
  return (
    <div className="grid gap-1">
      <p className="text-meta text-apagado">{AYUDA_DE_MARCAS}</p>
      <details>
        <summary className="flex min-h-objetivo cursor-pointer list-none items-center gap-2 text-meta font-semibold [&::-webkit-details-marker]:hidden">
          Marcas que conozco
          <CaretDown aria-hidden="true" size={ICONO.chico} className="text-apagado" />
        </summary>
        <ul className="flex flex-wrap gap-2 pb-2">
          {ETIQUETAS_DE_TONO.map((etiqueta) => (
            <li key={etiqueta} className="rounded-control bg-piedra-honda px-2.5 text-meta font-medium text-tinta">
              [{etiqueta}]
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
