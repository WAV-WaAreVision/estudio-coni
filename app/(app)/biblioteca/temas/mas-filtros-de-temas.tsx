import { Funnel } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { type FiltrosDeTemas, hrefDeTemas } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { type PilarDeRed, porRed } from "@/lib/dominio/pilares"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { FormularioDeFiltros } from "../formulario-de-filtros"

/**
 * The pillar, folded behind a chip in the row of the quick filters, grouped by network (spec 2026-11-04, section 5).
 * It filters on the main pillar.
 */
export function MasFiltrosDeTemas({ filtros, pilares }: { filtros: FiltrosDeTemas; pilares: readonly PilarDeRed[] }) {
  const activos = filtros.pilar ? 1 : 0
  return (
    <MasOpciones
      titulo={activos === 0 ? "Más filtros" : `Más filtros · ${activos}`}
      forma="boton"
      icono={<Funnel aria-hidden="true" size={ICONO.chico} />}
      abiertaAlInicio={activos > 0}
      className="open:basis-full [&>summary]:w-fit [&>summary]:gap-2 [&>summary]:px-4 [&>summary]:text-meta"
    >
      {/* The select is uncontrolled: a new key remounts it when the URL changes. */}
      <FormularioDeFiltros key={JSON.stringify(filtros)} seccion="temas" className="grid gap-3 md:max-w-sm">
        {filtros.cobertura ? <input type="hidden" name="cobertura" value={filtros.cobertura} /> : null}
        <Campo id="filtro-pilar" etiqueta="Pilar">
          <select id="filtro-pilar" name="pilar" defaultValue={filtros.pilar ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {porRed(pilares).map((grupo) => (
              <optgroup key={grupo.etiqueta} label={grupo.etiqueta}>
                {grupo.pilares.map((pilar) => (
                  <option key={pilar.id} value={pilar.id}>
                    {pilar.nombreCorto}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Campo>
        <Boton type="submit" variante="secundario" tamano="chico">
          Filtrar
        </Boton>
        {filtros.pilar ? (
          <Link href={hrefDeTemas({ cobertura: filtros.cobertura })} className={clasesDeBoton({ variante: "callado" })}>
            Quitar este filtro
          </Link>
        ) : null}
      </FormularioDeFiltros>
    </MasOpciones>
  )
}
