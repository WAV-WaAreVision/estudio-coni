import { Funnel } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { type FiltrosDeMateriales, hayFiltrosPlegados, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"
import { ETIQUETA_DE_ROL, ETIQUETA_DE_TIPO, ROLES, TIPOS_DE_MATERIAL } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { Campo, CLASES_DE_CAMPO } from "./campo"
import { FormularioDeFiltros } from "./formulario-de-filtros"

interface Propiedades {
  filtros: FiltrosDeMateriales
  autores: { id: string; nombre: string }[]
}

/**
 * Fix 4b: what is not the state goes folded, behind a chip in the row of the quick filters that opens below it. A GET
 * form: the filters live in the URL, survive a refresh and work without scripts; the quick filter travels with it as a
 * hidden field.
 */
export function MasFiltros({ filtros, autores }: Propiedades) {
  const activos = [filtros.autor, filtros.rol, filtros.tipo].filter(Boolean).length
  return (
    <MasOpciones
      titulo={activos === 0 ? "Más filtros" : `Más filtros · ${activos}`}
      forma="boton"
      icono={<Funnel aria-hidden="true" size={ICONO.chico} />}
      abiertaAlInicio={activos > 0}
      // Folded, a chip of the row; open, it takes the row's width so the form drops below the chips.
      className="open:basis-full [&>summary]:w-fit [&>summary]:gap-2 [&>summary]:px-4 [&>summary]:text-meta"
    >
      {/* The selects are uncontrolled: a new key remounts them when the URL changes. */}
      <FormularioDeFiltros key={JSON.stringify(filtros)} className="grid gap-3 md:max-w-sm">
        {filtros.estado ? <input type="hidden" name="estado" value={filtros.estado} /> : null}
        <Campo id="filtro-autor" etiqueta="Autor">
          <select id="filtro-autor" name="autor" defaultValue={filtros.autor ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {autores.map((autor) => (
              <option key={autor.id} value={autor.id}>
                {autor.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="filtro-rol" etiqueta={PALABRAS.papel}>
          <select id="filtro-rol" name="rol" defaultValue={filtros.rol ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {ROLES.map((rol) => (
              <option key={rol} value={rol}>
                {ETIQUETA_DE_ROL[rol]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="filtro-tipo" etiqueta="Tipo">
          <select id="filtro-tipo" name="tipo" defaultValue={filtros.tipo ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {TIPOS_DE_MATERIAL.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ETIQUETA_DE_TIPO[tipo]}
              </option>
            ))}
          </select>
        </Campo>
        <Boton type="submit" variante="secundario" tamano="chico">
          Filtrar
        </Boton>
        {hayFiltrosPlegados(filtros) ? (
          <Link href={hrefDeLista({ estado: filtros.estado })} className={clasesDeBoton({ variante: "callado" })}>
            Quitar estos filtros
          </Link>
        ) : null}
      </FormularioDeFiltros>
    </MasOpciones>
  )
}
