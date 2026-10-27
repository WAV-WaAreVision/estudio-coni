"use client"

import { useId, useState } from "react"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"
import { Seccion } from "@/components/seccion"
import { BarraDeFirma, LineaDeFalta } from "@/components/ui/barra-de-firma"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { FilaMeta } from "@/components/ui/fila-meta"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { Panel } from "@/components/ui/panel"
import { Volver } from "@/components/ui/volver"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import { type Lamina, MAXIMO_DEL_PEDIDO, TEXTO_SIN_CAMBIOS_DE_TEXTO } from "@/lib/dominio/carrusel"
import type { PilarVisible } from "@/lib/dominio/pilares"
import type { Hallazgo } from "@/lib/dominio/revision"
import { DescartarPieza } from "../../descartar-pieza"
import { firmarCarruselAccion, pedirCambioDeCarruselAccion } from "../../piezas/acciones"
import { faltaParaFirmarCarrusel } from "./falta-para-firmar"
import { LaminasEnLectura } from "./laminas-en-lectura"
import {
  TEXTO_AYUDA_DEL_PEDIDO,
  TEXTO_CARRUSEL_DE_LINKEDIN,
  TEXTO_CONSECUENCIA_CARRUSEL,
  TEXTO_REVISA_LAMINAS,
  TEXTO_REVISA_POST,
  TEXTO_SIN_OBSERVACIONES_CARRUSEL,
  textoCambiosQuedan,
} from "./textos"

export interface DatosDeCarrusel {
  id: string
  version: number
  titulo: string
  pilar: PilarVisible | null
  laminas: Lamina[]
  textoPost: string
  /** Every finding counts: a carousel's only destination is LinkedIn. */
  revision: Hallazgo[]
  /** "Pedir cambio" left (C8). */
  cambiosQuedan: number
  /** Why the change she asked for is not here (TEXTO_CAMBIO_NO_HECHO), or null. */
  explicacion: string | null
}

const claveDe = (hallazgo: Hallazgo) => `${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`

/**
 * Gate 1 of a carousel (design 2026-10-26, D1 step 3): the numbered slides, the post text and the review, "Pedir
 * cambio" with one sentence (no editing on the phone, C8) and "Desliza para firmar". No voice, no avatar, no cost.
 */
export function PantallaCarrusel({ datos }: { datos: DatosDeCarrusel }) {
  // Not `router.refresh()`: it loses the race with this address's prefetches (see `useRedibujar`).
  const redibujar = useRedibujar()
  const firma = useAccion()
  const cambio = useAccion()
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set())
  const [pedido, setPedido] = useState("")
  const idFalta = useId()
  const idConsecuencia = useId()
  const idAyuda = useId()
  const idPedido = useId()

  const bloqueos = datos.revision.filter((hallazgo) => hallazgo.tipo === "bloquea")
  const sinRevisar = datos.revision.filter(
    (hallazgo) => hallazgo.tipo === "advierte" && !confirmadas.has(claveDe(hallazgo)),
  )
  const falta = faltaParaFirmarCarrusel({ bloqueos: bloqueos.length, sinRevisar })
  const errorDeAccion = firma.error ?? cambio.error

  function alternar(hallazgo: Hallazgo, confirmada: boolean) {
    setConfirmadas((actuales) => {
      const siguientes = new Set(actuales)
      if (confirmada) siguientes.add(claveDe(hallazgo))
      else siguientes.delete(claveDe(hallazgo))
      return siguientes
    })
  }

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

      {datos.explicacion ? <Bloque tipo="aviso" titulo={datos.explicacion} className="mt-6" /> : null}

      <Seccion titulo={TEXTO_REVISA_LAMINAS} id="laminas" cifra={`${datos.laminas.length} láminas`}>
        <LaminasEnLectura laminas={datos.laminas} />
      </Seccion>

      <Seccion titulo={TEXTO_REVISA_POST} id="texto-del-post">
        <Panel>
          <p className="whitespace-pre-wrap text-cuerpo leading-prosa">{datos.textoPost}</p>
        </Panel>
        {datos.revision.length === 0 ? (
          <p className="text-meta text-apagado">{TEXTO_SIN_OBSERVACIONES_CARRUSEL}</p>
        ) : (
          datos.revision.map((hallazgo, indice) => (
            <MarcaRevision
              key={claveDe(hallazgo)}
              id={`revision-${indice}`}
              hallazgo={hallazgo}
              confirmada={confirmadas.has(claveDe(hallazgo))}
              alCambiar={(confirmada) => alternar(hallazgo, confirmada)}
            />
          ))
        )}
        <MasOpciones forma="boton" titulo="Pedir cambio" abiertaAlInicio={bloqueos.length > 0}>
          {datos.cambiosQuedan === 0 ? (
            <p className="mx-0.5 text-meta text-apagado">{TEXTO_SIN_CAMBIOS_DE_TEXTO}</p>
          ) : (
            <div className="grid gap-2">
              <label htmlFor={idPedido} className="text-meta font-semibold">
                ¿Qué quieres cambiar?
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

      <div className="mt-8">
        <DescartarPieza piezaId={datos.id} version={datos.version} />
      </div>

      <BarraDeFirma
        idConsecuencia={idConsecuencia}
        consecuencia={TEXTO_CONSECUENCIA_CARRUSEL}
        arriba={
          <>
            {errorDeAccion ? <Bloque tipo="error" titulo={errorDeAccion} /> : null}
            {falta.tipo === "falta" ? <LineaDeFalta id={idFalta} cosas={falta.cosas} /> : null}
          </>
        }
      >
        <DeslizarParaAprobar
          habilitado={falta.tipo === "nada"}
          enviando={firma.pendiente}
          describidoPor={falta.tipo === "nada" ? idConsecuencia : `${idFalta} ${idConsecuencia}`}
          alFirmar={() => firma.ejecutar(() => firmarCarruselAccion(datos.id, datos.version), redibujar)}
        />
      </BarraDeFirma>
    </div>
  )
}
