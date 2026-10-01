import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { Nota } from "@/components/nota"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { urlParaVer } from "@/lib/acciones/medios"
import { leerContextoDeFechas, leerCostoDeGrabar, leerPantallaDePieza } from "@/lib/datos/pantallas"
import { leerRevision } from "@/lib/datos/revision"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { etiquetaDeFecha, proponerFechas } from "@/lib/dominio/fechas"
import { esPilar } from "@/lib/dominio/pilares"
import { dolares } from "@/lib/formato"
import { exigirConi } from "@/lib/sesion/coni"
import { AccionesDeEstado, VolverAInicio } from "../../estado-de-pieza"
import { PantallaVideo } from "./pantalla-video"

const UNA_HORA_MS = 60 * 60 * 1000
const FECHAS_A_OFRECER = 4

export default async function PaginaDeVideo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { db } = await exigirConi()
  const pantalla = await leerPantallaDePieza(db, id)
  if (!pantalla) notFound()
  const { fila, idea } = pantalla

  switch (fila.estado) {
    case "video_por_aprobar":
      break
    case "programado": {
      const zona = (await leerContextoDeFechas(db, fila.id)).horario.zona
      return (
        <EstadoSencillo titulo={fila.titulo}>
          <Nota
            tipo="ok"
            titulo={`Programado para el ${fila.puerta2_publicar_en ? etiquetaDeFecha(fila.puerta2_publicar_en, zona, "larga") : "día aprobado"}`}
          >
            <p>Sale con la etiqueta de IA. Puedes cambiar la fecha mientras no se publique.</p>
          </Nota>
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["cambiarFecha", "descartar"]} />
        </EstadoSencillo>
      )
    }
    case "publicado":
      return (
        <EstadoSencillo titulo={fila.titulo}>
          <Nota tipo="ok" titulo="Ya se publicó">
            <p>La etiqueta de IA quedó puesta en Instagram.</p>
            {fila.permalink ? (
              <Link
                href={fila.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className={clasesDeBoton({ variante: "callado", tamano: "chico", className: "w-fit" })}
              >
                Ver en Instagram
                <ExternalLink aria-hidden="true" size={18} />
              </Link>
            ) : null}
          </Nota>
        </EstadoSencillo>
      )
    case "error_publicacion":
      return (
        <EstadoSencillo titulo={fila.titulo}>
          <Nota tipo="error" titulo="No se pudo publicar">
            <p>{fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}</p>
            {fila.media_id ? (
              <p>Es posible que el reel ya esté en Instagram. Reintentar solo vuelve a comprobarlo.</p>
            ) : null}
          </Nota>
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentar", "descartar"]} />
        </EstadoSencillo>
      )
    case "guion_por_aprobar":
    case "guion_en_proceso":
    case "en_render":
    case "subtitulando":
    case "error_produccion":
      return redirect(`/guion/${fila.id}`)
    default:
      return (
        <EstadoSencillo titulo={fila.titulo}>
          <p className="text-apagado">Esta pieza ya no está en curso.</p>
        </EstadoSencillo>
      )
  }

  if (fila.guion === null || fila.texto === null || fila.video_id === null) {
    throw new Error(`La pieza ${fila.id} está por aprobar sin guion, texto o video.`)
  }

  const ahora = Date.now()
  const contexto = await leerContextoDeFechas(db, fila.id)
  const fechas = proponerFechas({
    ahora,
    horario: contexto.horario,
    ocupadas: contexto.ocupadas,
    cuantas: FECHAS_A_OFRECER,
    antelacionMs: UNA_HORA_MS,
  }).map((iso) => ({ iso, etiqueta: etiquetaDeFecha(iso, contexto.horario.zona, "larga") }))
  const [videoUrl, costo] = await Promise.all([
    urlParaVer(fila.video_id),
    leerCostoDeGrabar(db, fila.guion, ahora, contexto.horario.zona),
  ])

  return (
    <PantallaVideo
      key={fila.version}
      datos={{
        id: fila.id,
        version: fila.version,
        titulo: fila.titulo,
        pilar: esPilar(idea?.pilar) ? idea.pilar : null,
        segundos: Math.round(estimarSegundos(fila.guion)),
        texto: fila.texto,
        revision: leerRevision(fila.revision),
        videoUrl,
        videoId: fila.video_id,
        fechas,
        costoDeRegrabar: costo.estimadoUsd === null ? null : `Regrabar cuesta unos ${dolares(costo.estimadoUsd)}.`,
        explicacion: fila.explicacion,
      }}
    />
  )
}

function EstadoSencillo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-5.5">
      <h1 className="font-serif text-display text-balance">{titulo}</h1>
      {children}
      <VolverAInicio />
    </div>
  )
}
