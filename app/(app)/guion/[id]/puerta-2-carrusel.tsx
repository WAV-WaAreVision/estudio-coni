"use client"

import { useCallback, useId, useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { Seccion } from "@/components/seccion"
import { BarraDeFirma, LineaDeFalta, ResumenListo } from "@/components/ui/barra-de-firma"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { FilaMeta } from "@/components/ui/fila-meta"
import { Eleccion } from "@/components/ui/filas"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Volver } from "@/components/ui/volver"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import { TEXTOS_DE_PROGRAMAR } from "@/lib/diseno/deslizador"
import { type Lamina, MAXIMO_DEL_PEDIDO, TEXTO_SIN_CAMBIOS_DE_TEXTO } from "@/lib/dominio/carrusel"
import type { DisenoDeCarrusel } from "@/lib/dominio/diseno-carrusel"
import type { PilarVisible } from "@/lib/dominio/pilares"
import { DescartarPieza } from "../../descartar-pieza"
import { aprobarCarruselAccion, pedirCambioDeCarruselAccion } from "../../piezas/acciones"
import type { FechaPropuesta } from "../../video/[id]/pantalla-video"
import { CambioDeDiseno } from "./cambio-de-diseno"
import { faltaParaProgramarCarrusel } from "./falta-para-programar"
import { lineaDeLinkedin } from "./linea-de-linkedin"
import { RielDeLaminas } from "./riel-de-laminas"
import { TextoDelPost } from "./texto-del-post"
import {
  TEXTO_ASI_SALE,
  TEXTO_AYUDA_DEL_PEDIDO,
  TEXTO_CAMBIO_DISENO,
  TEXTO_CAMBIO_TEXTO,
  TEXTO_CARRUSEL_DE_LINKEDIN,
  TEXTO_CUANDO_SALE,
  textoCambiosQuedan,
} from "./textos"

export interface DatosDePuerta2Carrusel {
  id: string
  version: number
  titulo: string
  pilar: PilarVisible | null
  /** The rendered version on screen: what the signature binds. */
  carruselId: string
  laminas: Lamina[]
  /** One signed PNG link per slide, in order (null when it could not be signed). */
  imagenes: (string | null)[]
  diseno: DisenoDeCarrusel
  textoPost: string
  fechas: FechaPropuesta[]
  /** Where her schedule lives ("America/Santiago"): the picked day and time are read there. */
  zona: string
  /** Her schedule hour (`19:00`): where "Otra fecha y hora" starts. */
  horaDelRitmo: string
  cambiosQuedan: number
  /** Why the piece is back here without the change she asked for (a design change that did not fit). */
  explicacion: string | null
  /** When her LinkedIn connection ends (null when not connected), read on the server: it decides the date's line. */
  linkedinExpiraEn: string | null
}

/**
 * Gate 2 of a carousel (design 2026-10-26, D1 step 5, mockup `puerta-2-carrusel.html` option A): the rail of slides,
 * the post, "Pedir cambio" (el texto, el diseño), the date and "Desliza para programar".
 */
export function PantallaPuerta2Carrusel({ datos }: { datos: DatosDePuerta2Carrusel }) {
  const redibujar = useRedibujar()
  const firma = useAccion()
  const cambio = useAccion()
  const [vioTodas, setVioTodas] = useState(false)
  const verTodas = useCallback(() => setVioTodas(true), [])
  const [fecha, setFecha] = useState(datos.fechas[0]?.iso ?? null)
  const [cambiandoFecha, setCambiandoFecha] = useState(false)
  const [queCambia, setQueCambia] = useState<"texto" | "diseno">("texto")
  const [pedido, setPedido] = useState("")
  const idFalta = useId()
  const idConsecuencia = useId()
  const idPedido = useId()
  const idAyuda = useId()

  const fechaElegida = datos.fechas.find((propuesta) => propuesta.iso === fecha)
  const falta = faltaParaProgramarCarrusel({ vioTodas, hayFecha: fechaElegida !== undefined })
  const errorDeAccion = firma.error ?? cambio.error

  return (
    <div>
      <header data-pilar={datos.pilar?.slug} className="grid gap-3">
        <Volver href="/">Inicio</Volver>
        <FilaMeta
          className="mt-2"
          pilar={datos.pilar?.nombreCorto}
          largo={`${TEXTO_CARRUSEL_DE_LINKEDIN} · ${datos.laminas.length} láminas`}
        />
        <h1 className="text-pieza text-balance">{datos.titulo}</h1>
      </header>

      {datos.explicacion ? (
        <div className="mt-4">
          <Bloque tipo="aviso" titulo={datos.explicacion} />
        </div>
      ) : null}

      <div className="mt-4">
        <RielDeLaminas
          laminas={datos.laminas.map((lamina, indice) => ({
            texto: lamina.texto,
            url: datos.imagenes[indice] ?? null,
          }))}
          alVerTodas={verTodas}
        />
      </div>

      <Seccion titulo={TEXTO_ASI_SALE} id="texto-del-post">
        <TextoDelPost texto={datos.textoPost} />
        <MasOpciones forma="boton" titulo="Pedir cambio">
          <fieldset className="elecciones grid border-0 p-0">
            <legend className="mb-2 text-meta font-semibold">¿Qué quieres cambiar?</legend>
            <Eleccion
              nombre="que-cambia"
              valor="texto"
              elegido={queCambia === "texto"}
              etiqueta="El texto"
              detalle={TEXTO_CAMBIO_TEXTO}
              alElegir={() => setQueCambia("texto")}
            />
            <Eleccion
              nombre="que-cambia"
              valor="diseno"
              elegido={queCambia === "diseno"}
              etiqueta="El diseño"
              detalle={TEXTO_CAMBIO_DISENO}
              alElegir={() => setQueCambia("diseno")}
            />
          </fieldset>
          {queCambia === "diseno" ? (
            <CambioDeDiseno
              piezaId={datos.id}
              version={datos.version}
              laminas={datos.laminas}
              diseno={datos.diseno}
              alHacerlo={redibujar}
            />
          ) : datos.cambiosQuedan === 0 ? (
            <p className="mx-0.5 text-meta text-apagado">{TEXTO_SIN_CAMBIOS_DE_TEXTO}</p>
          ) : (
            <div className="grid gap-2">
              <label htmlFor={idPedido} className="text-meta font-semibold">
                Escribe el cambio
              </label>
              <textarea
                id={idPedido}
                value={pedido}
                onChange={(evento) => setPedido(evento.target.value)}
                maxLength={MAXIMO_DEL_PEDIDO}
                aria-describedby={idAyuda}
                className="campo min-h-24 text-cuerpo font-normal text-tinta"
              />
              <p id={idAyuda} className="text-meta text-apagado">
                {TEXTO_AYUDA_DEL_PEDIDO} {textoCambiosQuedan(datos.cambiosQuedan)}
              </p>
              <Boton
                variante="secundario"
                deshabilitado={pedido.trim() === ""}
                cargando={cambio.pendiente}
                onClick={() =>
                  cambio.ejecutar(() => pedirCambioDeCarruselAccion(datos.id, datos.version, pedido), redibujar)
                }
              >
                Pedir este cambio
              </Boton>
            </div>
          )}
        </MasOpciones>
      </Seccion>

      <Seccion titulo={TEXTO_CUANDO_SALE} id="fecha">
        {fechaElegida ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="grid">
                <span data-snapshot="varia" className="font-semibold tabular-nums">
                  {fechaElegida.etiqueta}
                </span>
                <span className="text-meta text-apagado">LinkedIn · hora de Chile</span>
              </span>
              <Boton
                variante="secundario"
                tamano="chico"
                aria-expanded={cambiandoFecha}
                onClick={() => setCambiandoFecha((actual) => !actual)}
              >
                {cambiandoFecha ? "Listo" : "Cambiar"}
              </Boton>
            </div>
            <p className="text-meta text-apagado">{lineaDeLinkedin(datos.linkedinExpiraEn, fechaElegida.iso)}</p>
            {cambiandoFecha ? (
              <fieldset className="elecciones grid border-0 p-0">
                <legend className="sr-only">Elige cuándo sale</legend>
                {datos.fechas.map((propuesta) => (
                  <Eleccion
                    key={propuesta.iso}
                    nombre="fecha"
                    valor={propuesta.iso}
                    elegido={propuesta.iso === fecha}
                    etiqueta={propuesta.etiqueta}
                    alElegir={setFecha}
                  />
                ))}
              </fieldset>
            ) : null}
          </div>
        ) : (
          <p className="text-cuerpo text-apagado">No hay un horario libre en los próximos días.</p>
        )}
      </Seccion>

      <div className="mt-8">
        <DescartarPieza piezaId={datos.id} version={datos.version} />
      </div>

      <BarraDeFirma
        idConsecuencia={idConsecuencia}
        consecuencia={fechaElegida ? `Sale el ${fechaElegida.corta}` : undefined}
        consecuenciaVaria
        arriba={
          <>
            {errorDeAccion ? <Bloque tipo="error" titulo={errorDeAccion} /> : null}
            {falta.tipo === "falta" ? <LineaDeFalta id={idFalta} cosas={falta.cosas} /> : null}
            {falta.tipo === "nada" ? <ResumenListo id={idFalta} cosas={["Láminas vistas", "Fecha"]} /> : null}
          </>
        }
      >
        <DeslizarParaAprobar
          habilitado={falta.tipo === "nada"}
          enviando={firma.pendiente}
          {...TEXTOS_DE_PROGRAMAR}
          describidoPor={fechaElegida ? `${idFalta} ${idConsecuencia}` : idFalta}
          alFirmar={() => {
            if (fecha) {
              firma.ejecutar(() => aprobarCarruselAccion(datos.id, datos.version, datos.carruselId, fecha), redibujar)
            }
          }}
        />
      </BarraDeFirma>
    </div>
  )
}
