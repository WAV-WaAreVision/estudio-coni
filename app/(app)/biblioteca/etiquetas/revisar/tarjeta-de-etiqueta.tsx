"use client"

import Link from "next/link"
import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { type TarjetaDeEtiqueta, TEXTOS_DE_REVISION } from "@/lib/dominio/biblioteca/lote-de-etiquetas"
import { confirmarEtiquetaAccion } from "../../acciones"
import { EditorDeEtiqueta } from "../../afirmaciones/[id]/editor-de-etiqueta"

const ENLACE = "font-semibold text-tinta underline decoration-1 underline-offset-4"

/**
 * One doubtful tag of the week (spec 6c-2): the claim, the tag and why it is here, with «Está bien» and «Cambiar»
 * (the 6c-1 editor, already open). Bordered, not a panel: the editor inside is drawn on piedra-alta.
 */
export function TarjetaDeEtiquetaDudosa({ tarjeta }: { tarjeta: TarjetaDeEtiqueta }) {
  const [cambiando, setCambiando] = useState(false)
  const { pendiente, error, ejecutar } = useAccion()
  const idDelTitulo = `etiqueta-dudosa-${tarjeta.posicion}`
  return (
    <article
      aria-labelledby={idDelTitulo}
      className="grid h-full content-start gap-3 rounded-panel border border-hilo p-4"
    >
      <div className="grid gap-1">
        <p className="line-clamp-3 text-cuerpo">{`«${tarjeta.texto}»`}</p>
        {tarjeta.autor ? <p className="text-meta text-apagado">{tarjeta.autor}</p> : null}
      </div>
      <div className="grid gap-0.5">
        <h2 id={idDelTitulo} className="text-meta text-apagado">
          {tarjeta.titulo}
        </h2>
        {tarjeta.etiqueta ? <p className="text-cuerpo font-semibold text-tinta">{tarjeta.etiqueta}</p> : null}
        {tarjeta.frase ? <p className="text-meta text-tinta">{`«${tarjeta.frase}»`}</p> : null}
      </div>
      {tarjeta.estado === "hecha" ? (
        <p className="text-meta font-semibold text-tinta">{tarjeta.revision}</p>
      ) : cambiando ? (
        <EditorDeEtiqueta
          afirmacionId={tarjeta.afirmacionId}
          campo={tarjeta.campo}
          red={tarjeta.red}
          marcaId={tarjeta.marcaId}
          titulo={tarjeta.titulo}
          actual={{
            valor: tarjeta.valor,
            etiqueta: tarjeta.etiqueta,
            frase: tarjeta.frase,
            porQue: tarjeta.porQue,
            certezaBaja: false,
            revision: null,
          }}
          opciones={tarjeta.opciones}
          conFrase={tarjeta.conFrase}
          quitable={false}
          abrirAlMontar
          alCerrar={() => setCambiando(false)}
        />
      ) : (
        <>
          <p className="text-meta text-apagado">{tarjeta.motivo}</p>
          <div className="flex flex-wrap gap-2">
            {tarjeta.confirmable ? (
              <Boton
                variante="secundario"
                tamano="chico"
                cargando={pendiente}
                onClick={() =>
                  ejecutar(() =>
                    confirmarEtiquetaAccion({
                      afirmacionId: tarjeta.afirmacionId,
                      campo: tarjeta.campo,
                      red: tarjeta.red,
                      marcaId: tarjeta.marcaId,
                    }),
                  )
                }
              >
                Está bien
              </Boton>
            ) : null}
            <Boton tamano="chico" onClick={() => setCambiando(true)}>
              Cambiar
            </Boton>
          </div>
          {error ? <LineaDeError>{error}</LineaDeError> : null}
        </>
      )}
      <Link
        href={tarjeta.href}
        aria-describedby={idDelTitulo}
        className={`${ENLACE} inline-flex min-h-objetivo w-fit items-center`}
      >
        {TEXTOS_DE_REVISION.verAfirmacion}
      </Link>
    </article>
  )
}
