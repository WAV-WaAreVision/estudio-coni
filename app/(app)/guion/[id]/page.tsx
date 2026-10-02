import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { Nota } from "@/components/nota"
import { tieneVersionDeClaude } from "@/lib/acciones/guion"
import { urlParaVer } from "@/lib/acciones/medios"
import {
  leerAvataresElegibles,
  leerContextoDeFechas,
  leerCostoDeGrabar,
  leerPantallaDePieza,
} from "@/lib/datos/pantallas"
import { leerRevision } from "@/lib/datos/revision"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { etiquetaDeFecha, proponerFechas } from "@/lib/dominio/fechas"
import { esPilar } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { AccionesDeEstado, VolverAInicio } from "../../estado-de-pieza"
import { PantallaGuion } from "./pantalla-guion"

const DOCE_HORAS_MS = 12 * 60 * 60 * 1000

export default async function PaginaDeGuion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { db } = await exigirConi()
  const pantalla = await leerPantallaDePieza(db, id)
  if (!pantalla) notFound()
  const { fila, idea } = pantalla

  switch (fila.estado) {
    case "guion_por_aprobar":
      break
    case "guion_en_proceso":
      return (
        <EstadoSencillo titulo={fila.titulo}>
          {fila.explicacion ? (
            <>
              <Nota tipo="error" titulo="No pude escribir el guion">
                <p>{fila.explicacion}</p>
              </Nota>
              <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentarGuion", "descartar"]} />
            </>
          ) : (
            <Nota tipo="ocupada" titulo="Estoy escribiendo el guion">
              <p>Tarda unos minutos; te aviso cuando esté para que lo leas.</p>
              <span aria-hidden="true" className="esqueleto mt-1.5 h-1.5 w-2/3" />
            </Nota>
          )}
        </EstadoSencillo>
      )
    case "en_render":
    case "subtitulando":
      return (
        <EstadoSencillo titulo={fila.titulo}>
          <Nota tipo="ocupada" titulo="Aprobado. Estoy grabando el video.">
            <p>Tarda unos 5 minutos; te aviso cuando esté para que lo veas.</p>
            <span aria-hidden="true" className="esqueleto mt-1.5 h-1.5 w-2/3" />
          </Nota>
        </EstadoSencillo>
      )
    case "error_produccion":
      return (
        <EstadoSencillo titulo={fila.titulo}>
          <Nota tipo="error" titulo="No se pudo terminar el video">
            <p>{fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}</p>
          </Nota>
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentar", "descartar"]} />
        </EstadoSencillo>
      )
    case "video_por_aprobar":
    case "programado":
    case "para_subir_a_mano":
    case "publicado":
    case "publicado_a_mano":
    case "error_publicacion":
      return redirect(`/video/${fila.id}`)
    default:
      return (
        <EstadoSencillo titulo={fila.titulo}>
          <p className="text-apagado">Esta pieza ya no está en curso.</p>
        </EstadoSencillo>
      )
  }

  if (fila.guion === null || fila.texto === null) {
    throw new Error(`La pieza ${fila.id} está por aprobar sin guion o texto.`)
  }

  const ahora = Date.now()
  const contexto = await leerContextoDeFechas(db, fila.id)
  const propuestas = proponerFechas({
    ahora,
    horario: contexto.horario,
    ocupadas: contexto.ocupadas,
    cuantas: contexto.enCola + 1,
    antelacionMs: DOCE_HORAS_MS,
  })
  const salida = propuestas[contexto.enCola]
  const [costo, avatares, conVersionDeClaude] = await Promise.all([
    leerCostoDeGrabar(db, fila.guion, ahora, contexto.horario.zona, fila.audio_id),
    avataresParaElegir(db),
    tieneVersionDeClaude({ db }, fila.id),
  ])

  return (
    <PantallaGuion
      datos={{
        id: fila.id,
        version: fila.version,
        titulo: fila.titulo,
        pilar: esPilar(idea?.pilar) ? idea.pilar : null,
        formato: idea?.formato || null,
        segundos: Math.round(estimarSegundos(fila.guion)),
        guion: fila.guion,
        texto: fila.texto,
        revision: leerRevision(fila.revision),
        tieneVersionDeClaude: conVersionDeClaude,
        salida: salida ? etiquetaDeFecha(salida, contexto.horario.zona, "larga") : null,
        costo: costo.linea,
        explicacion: fila.explicacion,
        avatares,
      }}
    />
  )
}

/** The curated looks with a signed link to each photo. A setup that does not read leaves the list empty, which blocks. */
async function avataresParaElegir(db: Parameters<typeof leerAvataresElegibles>[0]) {
  let elegibles: Awaited<ReturnType<typeof leerAvataresElegibles>>
  try {
    elegibles = await leerAvataresElegibles(db)
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude leer los avatares para elegir", error)
    return []
  }
  return Promise.all(
    elegibles.map(async (avatar) => ({
      id: avatar.avatar_id,
      nombre: avatar.nombre,
      imagenUrl: await urlParaVer(avatar.imagen),
    })),
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
