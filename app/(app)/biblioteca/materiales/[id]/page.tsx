import { notFound } from "next/navigation"
import { z } from "zod"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Volver } from "@/components/ui/volver"
import { leerMapaDelMaterial, leerMaterialConFicha, listarAutores } from "@/lib/datos/biblioteca"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import { avisoDeProceso, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
import { adaptacionDe } from "@/lib/dominio/biblioteca/ficha"
import { esRol, etiquetaDeRol, etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { exigirConi } from "@/lib/sesion/coni"
import { BotonBorrar } from "../../boton-borrar"
import { BotonReintentar } from "../../boton-reintentar"
import { EstadoDeMaterial } from "../../estado-de-material"
import { BotonReprocesar } from "./boton-reprocesar"
import { EditarAutorYRol } from "./editar-autor-y-rol"
import { FichaEditable } from "./ficha-editable"
import { MapaDelMaterial } from "./mapa-del-material"

export default async function DetalleDeMaterial({ params }: { params: Promise<{ id: string }> }) {
  const [{ db }, { id }] = await Promise.all([exigirConi(), params])
  const valido = z.uuid().safeParse(id)
  if (!valido.success) notFound()
  const leido = await leerMaterialConFicha(db, valido.data)
  if (!leido) notFound()
  const { material, ficha } = leido
  const conFicha = material.rol === "estrategia"
  const [autores, mapa] = await Promise.all([listarAutores(db), conFicha ? null : leerMapaDelMaterial(db, material.id)])
  // What was processed follows the role it had then: after "¿Quién es para ti?" changes, only reprocessing shows it the new way.
  const rol = esRol(material.rol) ? material.rol : "referente"
  const procesadoConOtroRol = conFicha
    ? ficha === null && material.estado === "listo"
    : ficha !== null && (mapa?.total ?? 0) === 0

  const descarga = `/biblioteca/materiales/${material.id}/texto`
  const arrancar = sePuedeReintentar(material) ? <BotonReintentar materialId={material.id} /> : null
  const aviso = avisoDeProceso(material)
  const editar = (
    <EditarAutorYRol
      materialId={material.id}
      autores={autores}
      autorId={material.autor_id}
      rol={rol}
      conIdeas={(mapa?.total ?? 0) > 0 || ficha !== null}
    />
  )
  const reprocesar = material.estado === "listo" ? <BotonReprocesar materialId={material.id} rol={rol} /> : null
  const detalle = <DetalleParaWav lineas={lineasParaWav(material, mapa?.evidencia ?? {})} proveedor={null} />
  const borrar = <BotonBorrar tipo="material" id={material.id} />

  // The phone reads one column with the actions where they always were; a computer keeps the material in a readable
  // column and its actions in a side column (both live in the DOM, each shown on its own size: `contents md:hidden`
  // leaves the phone's layout as it was). The material comes first in the DOM, so a screen reader meets it first.
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,42rem)_20rem] md:items-start md:justify-between md:gap-10">
      <div data-detalle="principal" className="grid min-w-0 gap-6">
        <Volver href="/biblioteca">Materiales</Volver>
        <header className="grid gap-2">
          <h1 className="text-pantalla text-balance">{material.titulo ?? "Sin título"}</h1>
          <p className="text-meta text-apagado">
            {`${etiquetaDeTipo(material.tipo)} · ${material.autor} · ${etiquetaDeRol(material.rol)}`}
          </p>
          <div>
            <EstadoDeMaterial material={material} />
          </div>
          {aviso ? <LineaDeEstado tipo="neutro" titulo={aviso} /> : null}
          <div className="contents md:hidden">{arrancar}</div>
        </header>

        <div className="contents md:hidden">{editar}</div>

        {procesadoConOtroRol ? (
          <LineaDeEstado tipo="aviso" titulo="Cambiaste quién es para ti: reprocesa el material para verlo así." />
        ) : mapa ? (
          <MapaDelMaterial mapa={mapa} estado={material.estado} />
        ) : ficha ? (
          <>
            <p className="rounded-bloque bg-piedra-honda p-3.5 text-meta text-tinta">
              {adaptacionDe(material.idioma_original)}
            </p>
            <FichaEditable materialId={material.id} ficha={ficha} />
          </>
        ) : (
          <p className="text-cuerpo text-apagado">
            {material.estado === "listo"
              ? "No pude leer la ficha de este material. Avísale a Federico."
              : "La ficha aparece cuando termina de procesarse."}
          </p>
        )}

        <div className="contents md:hidden">
          {material.estado === "listo" ? (
            // A plain link (D12): a Link would prefetch the route handler and sign a download on every render.
            <a href={descarga} className={clasesDeBoton({ variante: "secundario" })}>
              Descargar texto original
            </a>
          ) : null}
          {reprocesar}
          {detalle}
          {borrar}
        </div>
      </div>

      <aside
        aria-label="Acciones del material"
        className="hidden md:sticky md:top-24 md:grid md:max-h-[calc(100dvh-7rem)] md:content-start md:justify-items-start md:gap-4 md:overflow-y-auto md:rounded-panel md:bg-piedra-alta md:p-5"
      >
        {arrancar}
        {material.estado === "listo" ? (
          <a href={descarga} className={clasesDeBoton({ variante: "secundario", tamano: "chico" })}>
            Descargar texto original
          </a>
        ) : null}
        {reprocesar}
        <div className="w-full">{editar}</div>
        <div className="w-full">{detalle}</div>
        {borrar}
      </aside>
    </div>
  )
}
