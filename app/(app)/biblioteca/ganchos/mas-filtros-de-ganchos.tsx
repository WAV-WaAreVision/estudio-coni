import { Funnel } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ICONO } from "@/components/ui/icono"
import { MasOpciones } from "@/components/ui/mas-opciones"
import {
  type FiltrosDeGanchos,
  filtrosPlegados,
  hrefDeGanchos,
  sinPlegados,
} from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import {
  ETIQUETA_SIN_CLASIFICAR,
  type Opcion,
  SIN_CLASIFICAR,
  type TipoDeGancho,
} from "@/lib/dominio/biblioteca/ganchos"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { FormularioDeFiltrosDeGanchos } from "./formulario-de-filtros-de-ganchos"

/** Type, topic and author, folded behind a chip as in Materiales; the quick filters travel as hidden fields. */
export function MasFiltrosDeGanchos({
  filtros,
  tipos,
  opciones,
}: {
  filtros: FiltrosDeGanchos
  tipos: readonly TipoDeGancho[]
  opciones: { autores: Opcion[]; temas: Opcion[] }
}) {
  const activos = filtrosPlegados(filtros)
  return (
    <MasOpciones
      titulo={activos === 0 ? "Más filtros" : `Más filtros · ${activos}`}
      forma="boton"
      icono={<Funnel aria-hidden="true" size={ICONO.chico} />}
      abiertaAlInicio={activos > 0}
      className="open:basis-full [&>summary]:w-fit [&>summary]:gap-2 [&>summary]:px-4 [&>summary]:text-meta"
    >
      {/* The selects are uncontrolled: a new key remounts them when the address changes. */}
      <FormularioDeFiltrosDeGanchos key={JSON.stringify(filtros)} className="grid gap-3 md:max-w-sm">
        {filtros.red ? <input type="hidden" name="red" value={filtros.red} /> : null}
        {filtros.pilar ? <input type="hidden" name="pilar" value={filtros.pilar} /> : null}
        {filtros.favoritos ? <input type="hidden" name="favoritos" value="1" /> : null}
        {filtros.misTipos ? <input type="hidden" name="mis-tipos" value="1" /> : null}
        <Campo id="filtro-tipo-de-gancho" etiqueta="Tipo">
          <select id="filtro-tipo-de-gancho" name="tipo" defaultValue={filtros.tipo ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {tipos
              .filter((tipo) => tipo.activo)
              .map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.etiqueta}
                </option>
              ))}
            <option value={SIN_CLASIFICAR}>{ETIQUETA_SIN_CLASIFICAR}</option>
          </select>
        </Campo>
        <Campo id="filtro-tema-de-gancho" etiqueta="Tema">
          <select id="filtro-tema-de-gancho" name="tema" defaultValue={filtros.tema ?? ""} className={CLASES_DE_CAMPO}>
            <option value="">Todos</option>
            {opciones.temas.map((tema) => (
              <option key={tema.id} value={tema.id}>
                {tema.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="filtro-autor-de-gancho" etiqueta="Autor">
          <select
            id="filtro-autor-de-gancho"
            name="autor"
            defaultValue={filtros.autor ?? ""}
            className={CLASES_DE_CAMPO}
          >
            <option value="">Todos</option>
            {opciones.autores.map((autor) => (
              <option key={autor.id} value={autor.id}>
                {autor.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Boton type="submit" variante="secundario" tamano="chico">
          Filtrar
        </Boton>
        {activos > 0 ? (
          <Link href={hrefDeGanchos(sinPlegados(filtros))} className={clasesDeBoton({ variante: "callado" })}>
            Quitar estos filtros
          </Link>
        ) : null}
      </FormularioDeFiltrosDeGanchos>
    </MasOpciones>
  )
}
