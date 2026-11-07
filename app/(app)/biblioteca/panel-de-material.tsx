import Link from "next/link"
import { Seccion } from "@/components/seccion"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import type { PanelDelMaterial } from "@/lib/datos/biblioteca"
import { hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import { avisoDeProceso, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
import { subidoEnFrase, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { type FiltrosDeMateriales, hrefDeLista } from "@/lib/dominio/biblioteca/filtros"
import { etiquetaDeRol, etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { BotonBorrar } from "./boton-borrar"
import { BotonReintentar } from "./boton-reintentar"
import { EstadoDeMaterial } from "./estado-de-material"

interface Propiedades {
  panel: PanelDelMaterial
  filtros: FiltrosDeMateriales
  ahora: number
}

/** The computer's side panel (spec 3): what a material gave, who it is for her, and WAV's detail folded. */
export function PanelDeMaterial({ panel, filtros, ahora }: Propiedades) {
  const { material, ideas, evidencia } = panel
  const aviso = avisoDeProceso(material)
  return (
    <section aria-labelledby="panel-titulo" className="grid gap-6 rounded-panel bg-piedra-alta p-5">
      <div className="flex flex-wrap items-center gap-2 text-meta text-apagado">
        <span data-snapshot="varia">
          {`${etiquetaDeTipo(material.tipo)} · ${subidoEnFrase(material.creado_en, ahora, ZONA_DE_LA_BIBLIOTECA)}`}
        </span>
        <EstadoDeMaterial material={material} />
      </div>
      <h2 id="panel-titulo" tabIndex={-1} className="text-pieza text-balance">
        {material.titulo ?? "Sin título"}
      </h2>
      {aviso ? <LineaDeEstado tipo="neutro" titulo={aviso} /> : null}
      <Seccion titulo={PALABRAS.afirmaciones} id="panel-ideas" cifra={ideas.total} espacio="ninguno" nivel={3}>
        {ideas.primeras.length === 0 ? (
          <p className="text-cuerpo text-apagado">
            {material.estado === "listo"
              ? "Este material no dejó ideas."
              : "Las ideas aparecen cuando termina de procesarse."}
          </p>
        ) : (
          <ul className="grid gap-2">
            {ideas.primeras.map((idea, indice) => (
              // The first two ideas are a fixed list, replaced whole on every render: the position is its identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <li key={indice} className="text-cuerpo">{`«${idea}»`}</li>
            ))}
          </ul>
        )}
        {ideas.total > 0 ? (
          <Link href={`/biblioteca/materiales/${material.id}`} className={clasesDeBoton({ variante: "callado" })}>
            {ideas.total === 1 ? "Ver la idea" : `Ver las ${ideas.total}`}
          </Link>
        ) : null}
      </Seccion>
      <Seccion titulo={PALABRAS.papel} id="panel-quien" espacio="ninguno" nivel={3}>
        <p className="text-cuerpo">
          <Link
            href={hrefDeAutor(material.autor_id)}
            className="font-semibold underline decoration-1 underline-offset-4"
          >
            {material.autor}
          </Link>
          {material.credencial ? ` · ${material.credencial}` : null}
        </p>
        <p className="text-meta text-apagado">{etiquetaDeRol(material.rol)}</p>
      </Seccion>
      {sePuedeReintentar(material) ? <BotonReintentar materialId={material.id} /> : null}
      <DetalleParaWav lineas={lineasParaWav(material, evidencia)} proveedor={null} />
      <BotonBorrar tipo="material" id={material.id} />
      <Link
        href={hrefDeLista(filtros)}
        scroll={false}
        data-cierra-panel={material.id}
        className={clasesDeBoton({ variante: "callado" })}
      >
        Cerrar el panel
      </Link>
    </section>
  )
}

/** With no `?m`, the panel says what it is for. */
export function PistaDelPanel() {
  return (
    <Panel>
      <p className="text-cuerpo text-apagado">
        Elige un material de la tabla para ver aquí sus ideas y quién es para ti.
      </p>
    </Panel>
  )
}
