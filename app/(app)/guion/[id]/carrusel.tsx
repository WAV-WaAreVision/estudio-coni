import { House } from "@phosphor-icons/react/dist/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import Link from "next/link"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { Seccion } from "@/components/seccion"
import { Bloque } from "@/components/ui/bloque"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ExplicacionParaConi } from "@/components/ui/detalle-para-wav"
import { ICONO } from "@/components/ui/icono"
import { Panel } from "@/components/ui/panel"
import { contarCambiosDeTexto, leerCarruselVigente } from "@/lib/datos/carrusel"
import type { FilaDePieza } from "@/lib/datos/repositorio"
import { leerRevision } from "@/lib/datos/revision"
import { cambiosQuedan } from "@/lib/dominio/carrusel"
import type { PilarVisible } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { AccionesDeEstado } from "../../estado-de-pieza"
import { LaminasEnLectura } from "./laminas-en-lectura"
import { PantallaCarrusel } from "./pantalla-carrusel"
import {
  TEXTO_ASI_QUEDO_FIRMADO,
  TEXTO_CARRUSEL_ESPERA,
  TEXTO_CARRUSEL_FIRMADO,
  TEXTO_ESCRIBIENDO_CARRUSEL,
  TEXTO_NO_ESCRIBI_CARRUSEL,
  TEXTO_REINTENTA,
} from "./textos"
import { Trabajando } from "./trabajando"

/** A carousel's `/guion/<id>` (design 2026-10-26, part 1): written, at gate 1, or signed and waiting (amendment 1). */
export async function VistaDeCarrusel({
  db,
  fila,
  pilar,
}: {
  db: SupabaseClient<Database>
  fila: FilaDePieza
  pilar: PilarVisible | null
}) {
  switch (fila.estado) {
    case "guion_en_proceso":
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          {fila.explicacion ? (
            <>
              <Bloque
                tipo="error"
                grande
                titulo={TEXTO_NO_ESCRIBI_CARRUSEL}
                accion={
                  <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["reintentarGuion"]} enUnError />
                }
              >
                <ExplicacionParaConi texto={fila.explicacion} enSusPalabras={TEXTO_REINTENTA} />
              </Bloque>
              <AccionesDeEstado piezaId={fila.id} version={fila.version} acciones={["descartar"]} />
            </>
          ) : (
            <Trabajando
              titulo={TEXTO_ESCRIBIENDO_CARRUSEL}
              detalle="Tarda unos minutos; te aviso cuando esté para que lo leas."
            />
          )}
          <RefrescoAutomatico activo={fila.explicacion === null} cadaMs={4000} />
        </EstadoSencillo>
      )
    case "guion_por_aprobar": {
      const [carrusel, cambios] = await Promise.all([
        leerCarruselVigente(db, fila.id),
        contarCambiosDeTexto(db, fila.id),
      ])
      if (!carrusel) throw new Error(`La pieza ${fila.id} está por aprobar sin carrusel.`)
      return (
        <PantallaCarrusel
          // A new version or a refused signature brings a new piece version: the screen starts over with it.
          key={`${fila.id}:${fila.version}`}
          datos={{
            id: fila.id,
            version: fila.version,
            titulo: fila.titulo,
            pilar,
            laminas: carrusel.laminas,
            textoPost: carrusel.textoPost,
            revision: leerRevision(fila.revision),
            cambiosQuedan: cambiosQuedan(cambios),
            explicacion: fila.explicacion,
          }}
        />
      )
    }
    case "armando_carrusel": {
      const carrusel = await leerCarruselVigente(db, fila.id)
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <Bloque tipo="ok" titulo={TEXTO_CARRUSEL_FIRMADO}>
            {TEXTO_CARRUSEL_ESPERA}
          </Bloque>
          {carrusel ? (
            <Seccion titulo={TEXTO_ASI_QUEDO_FIRMADO} id="firmado">
              <LaminasEnLectura laminas={carrusel.laminas} />
              <Panel>
                <p className="whitespace-pre-wrap text-cuerpo leading-prosa">{carrusel.textoPost}</p>
              </Panel>
            </Seccion>
          ) : null}
          <Link href="/" className={clasesDeBoton({ variante: "secundario" })}>
            Volver a Inicio
            <House aria-hidden="true" size={ICONO.medio} />
          </Link>
        </EstadoSencillo>
      )
    }
    default:
      return (
        <EstadoSencillo titulo={fila.titulo} pilar={pilar}>
          <p className="text-cuerpo text-apagado">Esta pieza ya no está en curso.</p>
        </EstadoSencillo>
      )
  }
}
