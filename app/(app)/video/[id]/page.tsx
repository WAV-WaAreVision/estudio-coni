import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { MomentoDeCierre } from "@/components/momento-de-cierre"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { urlParaVer } from "@/lib/acciones/medios"
import {
  leerContextoDeFechas,
  leerCostoDeGrabar,
  leerInstagramConectado,
  leerLinkedinConectado,
  leerPantallaDePieza,
} from "@/lib/datos/pantallas"
import { leerPilares } from "@/lib/datos/pilares"
import { leerPublicaciones } from "@/lib/datos/repositorio"
import { leerRevision } from "@/lib/datos/revision"
import { type Destino, destinosDe, destinosPorDefecto, nombreDeDestino, nombreDeDestinos } from "@/lib/dominio/destinos"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { etiquetaDeFecha } from "@/lib/dominio/fechas"
import { pilarVisible } from "@/lib/dominio/pilares"
import { dolares } from "@/lib/formato"
import { exigirConi } from "@/lib/sesion/coni"
import { AccionesDeEstado } from "../../estado-de-pieza"
import { fechasDePuerta2 } from "../../fechas-de-puerta-2"
import { descargarVideoAccion, marcarSubidoAManoAccion } from "../../piezas/acciones"
import { detalleDeProgramado, detalleDePublicado } from "./detalle-programado"
import { PantallaVideo } from "./pantalla-video"
import { PorSubir } from "./por-subir"

const segundosDe = (guion: string | null) => (guion ? Math.round(estimarSegundos(guion)) : undefined)

export default async function PaginaDeVideo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { db } = await exigirConi()
  const [pantalla, pilares] = await Promise.all([leerPantallaDePieza(db, id), leerPilares(db)])
  if (!pantalla) notFound()
  const { fila, idea } = pantalla
  // Every carousel state lives on /guion/<id> (plan amendment 13); the shared links of Inicio may land here.
  if (fila.tipo === "carrusel") redirect(`/guion/${fila.id}`)
  const pilar = pilarVisible(pilares, idea?.pilar)

  switch (fila.estado) {
    case "video_por_aprobar":
      break
    case "programado": {
      const zona = (await leerContextoDeFechas(db, fila.id)).horario.zona
      const instagramConectado = await leerInstagramConectado(db)
      const linkedinConectado = await leerLinkedinConectado(db, Date.now())
      const publicaciones = await leerPublicaciones(db, fila.id)
      const destinos = destinosDe(fila.destinos)
      // Before its time she can already upload what goes by hand: a destination that is not connected. A connected
      // one posts by itself, and the database refuses an early mark of it.
      const pendientes = publicaciones
        .filter(
          (p) => p.estado === "esperando" && (p.destino === "linkedin" ? !linkedinConectado : !instagramConectado),
        )
        .map((p) => p.destino)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="exito"
            titulo={`Programado para el ${fila.puerta2_publicar_en ? etiquetaDeFecha(fila.puerta2_publicar_en, zona, "larga") : "día aprobado"}`}
            detalle={detalleDeProgramado(destinos, { instagramConectado, linkedinConectado })}
          />
          {fila.texto !== null ? (
            <PorSubir
              piezaId={fila.id}
              version={fila.version}
              texto={fila.texto}
              textoLinkedin={fila.texto_linkedin}
              publicaciones={publicaciones}
              pendientes={pendientes}
              alDescargar={descargarVideoAccion}
              alMarcar={marcarSubidoAManoAccion}
            />
          ) : null}
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["cambiarFecha", "descartar"]} />
        </EstadoSencillo>
      )
    }
    case "para_subir_a_mano": {
      if (fila.texto === null) throw new Error(`La pieza ${fila.id} espera subirse sin texto guardado.`)
      const publicaciones = await leerPublicaciones(db, fila.id)
      const pendientes = publicaciones.filter((p) => p.estado === "para_subir").map((p) => p.destino)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="aviso"
            titulo={`Listo para que lo subas a ${nombreDeDestinos(pendientes)}`}
            detalle={
              pendientes.includes("instagram")
                ? "Instagram todavía no está conectado, así que este reel no sale solo. Súbelo tú con estos pasos."
                : "LinkedIn se sube a mano. Súbelo tú con estos pasos."
            }
          />
          <PorSubir
            piezaId={fila.id}
            version={fila.version}
            texto={fila.texto}
            textoLinkedin={fila.texto_linkedin}
            publicaciones={publicaciones}
            pendientes={pendientes}
            alDescargar={descargarVideoAccion}
            alMarcar={marcarSubidoAManoAccion}
          />
          <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
        </EstadoSencillo>
      )
    }
    case "publicado_a_mano": {
      const publicaciones = await leerPublicaciones(db, fila.id)
      const subidas = publicaciones.filter((p) => p.estado === "subido_a_mano")
      // LinkedIn may have gone out by itself while the other destination was uploaded by hand.
      const linkedinSolo = publicaciones.some((p) => p.destino === "linkedin" && p.estado === "publicado")
      const cierre = linkedinSolo ? detalleDePublicado(publicaciones) : null
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          <MomentoDeCierre
            titulo="Subido a mano"
            detalle={cierre ? cierre.detalle : detalleDeSubida(subidas.map((p) => p.destino))}
            enlaces={[
              ...subidas.flatMap((p) =>
                p.enlace ? [{ etiqueta: `Ver en ${nombreDeDestino(p.destino)}`, href: p.enlace }] : [],
              ),
              ...(cierre?.enlaces ?? []),
            ]}
          />
        </EstadoSencillo>
      )
    }
    case "publicado": {
      const cierre = detalleDePublicado(await leerPublicaciones(db, fila.id))
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          <MomentoDeCierre
            titulo="Ya se publicó"
            detalle={cierre.detalle}
            enlace={fila.permalink}
            enlaces={cierre.enlaces}
          />
        </EstadoSencillo>
      )
    }
    case "error_publicacion":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          <LineaDeEstado
            tipo="error"
            titulo="No se pudo publicar"
            detalle={
              <>
                <ExplicacionParaConi
                  texto={fila.explicacion ?? "Algo no salió como esperábamos con esta pieza."}
                  enSusPalabras="Vuelve a intentarlo con Reintentar."
                />
                {fila.media_id ? (
                  <p>Es posible que el reel ya esté en Instagram. Reintentar solo vuelve a comprobarlo.</p>
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
        <EstadoSencillo titulo={fila.titulo} pilar={pilar} segundos={segundosDe(fila.guion)}>
          <p className="text-cuerpo text-apagado">Esta pieza ya no está en curso.</p>
        </EstadoSencillo>
      )
  }

  if (fila.guion === null || fila.texto === null || fila.video_id === null) {
    throw new Error(`La pieza ${fila.id} está por aprobar sin guion, texto o video.`)
  }

  const ahora = Date.now()
  const { fechas, zona } = await fechasDePuerta2(db, fila.id, ahora)
  const [videoUrl, costo, ajustes, instagramConectado, linkedinConectado] = await Promise.all([
    urlParaVer(fila.video_id),
    leerCostoDeGrabar(db, fila.guion, ahora, zona, fila.audio_id),
    leerAjustesDelVideo(db),
    leerInstagramConectado(db),
    leerLinkedinConectado(db, ahora),
  ])

  return (
    <PantallaVideo
      key={fila.version}
      datos={{
        id: fila.id,
        version: fila.version,
        titulo: fila.titulo,
        pilar,
        segundos: Math.round(estimarSegundos(fila.guion)),
        texto: fila.texto,
        textoLinkedin: fila.texto_linkedin,
        // What she would publish if she did not touch it: where Ajustes says reels go by default.
        destinosPorDefecto: ajustes.destinosPorDefecto,
        instagramConectado,
        linkedinConectado,
        revision: leerRevision(fila.revision),
        videoUrl,
        videoId: fila.video_id,
        fechas,
        costoDeRegrabar: costo.estimadoUsd === null ? null : dolares(costo.estimadoUsd),
        explicacion: fila.explicacion,
        primeraVez: ajustes.primeraVez,
      }}
    />
  )
}

/** What she did, in her words: Instagram keeps saying the AI label went on, as it always did. */
function detalleDeSubida(destinos: readonly Destino[]): string {
  if (destinos.length === 1 && destinos[0] === "instagram") return "Lo subiste tú a Instagram, con la etiqueta de IA."
  return `Lo subiste tú a ${nombreDeDestinos(destinos)}.`
}

async function leerAjustesDelVideo(
  db: Awaited<ReturnType<typeof exigirConi>>["db"],
): Promise<{ primeraVez: boolean; destinosPorDefecto: Destino[] }> {
  const { data, error } = await db.from("ajustes").select("avatar_visto_en, destinos_por_defecto").maybeSingle()
  if (error) throw new Error(`No pude leer los ajustes: ${error.message}`, { cause: error })
  return {
    primeraVez: data?.avatar_visto_en === null,
    destinosPorDefecto: destinosPorDefecto(data?.destinos_por_defecto ?? []),
  }
}
