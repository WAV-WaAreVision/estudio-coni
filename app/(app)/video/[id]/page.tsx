import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { MomentoDeCierre } from "@/components/momento-de-cierre"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { urlParaVer } from "@/lib/acciones/medios"
import {
  leerContextoDeFechas,
  leerCostoDeGrabar,
  leerInstagramConectado,
  leerPantallaDePieza,
} from "@/lib/datos/pantallas"
import { leerRevision } from "@/lib/datos/revision"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { etiquetaDeFecha, proponerFechas } from "@/lib/dominio/fechas"
import { esPilar } from "@/lib/dominio/pilares"
import { dolares } from "@/lib/formato"
import { exigirConi } from "@/lib/sesion/coni"
import { AccionesDeEstado } from "../../estado-de-pieza"
import { descargarVideoAccion, marcarSubidoAManoAccion } from "../../piezas/acciones"
import { PantallaVideo } from "./pantalla-video"
import { SubirAMano } from "./subir-a-mano"

const pilarDe = (idea: { pilar?: string | null } | null | undefined) => (esPilar(idea?.pilar) ? idea.pilar : null)
const segundosDe = (guion: string | null) => (guion ? Math.round(estimarSegundos(guion)) : undefined)

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
      const sinInstagram = !(await leerInstagramConectado(db))
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="exito"
            titulo={`Programado para el ${fila.puerta2_publicar_en ? etiquetaDeFecha(fila.puerta2_publicar_en, zona, "larga") : "día aprobado"}`}
            detalle={
              sinInstagram
                ? "Instagram todavía no está conectado, así que este reel no sale solo. A esa hora te aviso y lo subes tú."
                : "Sale con la etiqueta de IA. Puedes cambiar la fecha mientras no se publique."
            }
          />
          {sinInstagram && fila.texto !== null ? (
            <SubirAMano
              piezaId={fila.id}
              version={fila.version}
              texto={fila.texto}
              alDescargar={descargarVideoAccion}
              alMarcar={marcarSubidoAManoAccion}
            />
          ) : null}
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["cambiarFecha", "descartar"]} />
        </EstadoSencillo>
      )
    }
    case "para_subir_a_mano":
      if (fila.texto === null) throw new Error(`La pieza ${fila.id} espera subirse sin texto guardado.`)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="aviso"
            titulo="Listo para que lo subas a Instagram"
            detalle="Instagram todavía no está conectado, así que este reel no sale solo. Súbelo tú con estos pasos."
          />
          <SubirAMano
            piezaId={fila.id}
            version={fila.version}
            texto={fila.texto}
            alDescargar={descargarVideoAccion}
            alMarcar={marcarSubidoAManoAccion}
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
        </EstadoSencillo>
      )
    case "publicado_a_mano":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <MomentoDeCierre
            titulo="Subido a mano"
            detalle="Lo subiste tú a Instagram, con la etiqueta de IA."
            enlace={fila.permalink}
          />
        </EstadoSencillo>
      )
    case "publicado":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <MomentoDeCierre
            titulo="Ya se publicó"
            detalle="La etiqueta de IA quedó puesta en Instagram."
            enlace={fila.permalink}
          />
        </EstadoSencillo>
      )
    case "error_publicacion":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="error"
            titulo="No se pudo publicar"
            detalle={
              <>
                {fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}
                {fila.media_id ? (
                  <> Es posible que el reel ya esté en Instagram. Reintentar solo vuelve a comprobarlo.</>
                ) : null}
              </>
            }
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentar", "descartar"]} />
        </EstadoSencillo>
      )
    case "guion_por_aprobar":
    case "guion_en_proceso":
    case "guion_aprobado":
    case "grabando_voz":
    case "en_render":
    case "subtitulando":
    case "error_produccion":
      return redirect(`/guion/${fila.id}`)
    default:
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilarDe(idea)} segundos={segundosDe(fila.guion)}>
          <p className="text-cuerpo text-apagado">Esta pieza ya no está en curso.</p>
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
    leerCostoDeGrabar(db, fila.guion, ahora, contexto.horario.zona, fila.audio_id),
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
        primeraVez: await esPrimeraVez(db),
      }}
    />
  )
}

async function esPrimeraVez(db: Awaited<ReturnType<typeof exigirConi>>["db"]): Promise<boolean> {
  const { data, error } = await db.from("ajustes").select("avatar_visto_en").maybeSingle()
  if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
  return data?.avatar_visto_en === null
}
