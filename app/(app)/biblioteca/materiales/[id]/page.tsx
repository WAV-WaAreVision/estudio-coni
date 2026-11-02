import { notFound } from "next/navigation"
import { z } from "zod"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { DetalleParaWav } from "@/components/ui/detalle-para-wav"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Volver } from "@/components/ui/volver"
import { leerMapaDelMaterial, leerMaterialConFicha, listarAutores } from "@/lib/datos/biblioteca"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import { esperaConfirmacion, sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
import { adaptacionDe } from "@/lib/dominio/biblioteca/ficha"
import { esRol, etiquetaDeRol, etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { exigirConi } from "@/lib/sesion/coni"
import { BotonConfirmarCosto } from "../../boton-confirmar-costo"
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
  const procesadoConOtroRol = conFicha
    ? ficha === null && material.estado === "listo"
    : ficha !== null && (mapa?.total ?? 0) === 0

  return (
    <div className="grid gap-6">
      <Volver href="/biblioteca">Materiales</Volver>
      <header className="grid gap-2">
        <h1 className="text-pantalla text-balance">{material.titulo ?? "Sin título"}</h1>
        <p className="text-meta text-apagado">
          {`${etiquetaDeTipo(material.tipo)} · ${material.autor} · ${etiquetaDeRol(material.rol)}`}
        </p>
        <div>
          <EstadoDeMaterial material={material} />
        </div>
        {esperaConfirmacion(material) && material.costo_estimado_usd !== null ? (
          <BotonConfirmarCosto materialId={material.id} costoUsd={material.costo_estimado_usd} />
        ) : null}
        {sePuedeReintentar(material) ? <BotonReintentar materialId={material.id} /> : null}
      </header>

      <EditarAutorYRol
        materialId={material.id}
        autores={autores}
        autorId={material.autor_id}
        rol={esRol(material.rol) ? material.rol : "referente"}
        conIdeas={(mapa?.total ?? 0) > 0 || ficha !== null}
      />

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

      {material.estado === "listo" ? (
        // A plain link (D12): a Link would prefetch the route handler and sign a download on every render.
        <a href={`/biblioteca/materiales/${material.id}/texto`} className={clasesDeBoton({ variante: "secundario" })}>
          Descargar texto original
        </a>
      ) : null}
      {material.estado === "listo" ? <BotonReprocesar materialId={material.id} /> : null}

      <DetalleParaWav lineas={lineasParaWav(material, mapa?.evidencia ?? {})} proveedor={null} />
    </div>
  )
}
