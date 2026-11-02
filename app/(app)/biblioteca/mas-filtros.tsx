import Link from "next/link"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { MasOpciones } from "@/components/ui/mas-opciones"
import {
  type FiltrosDeMateriales,
  hayFiltrosPlegados,
  hrefDeLista,
  RUTA_DE_MATERIALES,
} from "@/lib/dominio/biblioteca/filtros"
import { ETIQUETA_DE_ROL, ETIQUETA_DE_TIPO, ROLES, TIPOS_DE_MATERIAL } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { Campo, CLASES_DE_CAMPO } from "./campo"

interface Propiedades {
  filtros: FiltrosDeMateriales
  autores: { id: string; nombre: string }[]
}

/**
 * Fix 4b: what is not the state goes folded. A plain GET form: the filters live in the URL, survive a refresh and work
 * without scripts; the quick filter travels with it as a hidden field.
 */
export function MasFiltros({ filtros, autores }: Propiedades) {
  const activos = [filtros.autor, filtros.rol, filtros.tipo].filter(Boolean).length
  return (
    <MasOpciones
      titulo="Más filtros"
      resumen={activos === 0 ? undefined : activos === 1 ? "1 activo" : `${activos} activos`}
      abiertaAlInicio={activos > 0}
    >
      {/* The selects are uncontrolled: a new key remounts them when the URL changes. */}
      <form key={JSON.stringify(filtros)} method="get" action={RUTA_DE_MATERIALES} className="grid gap-3">
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
      </form>
    </MasOpciones>
  )
}
