"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { type TarjetaDeEtiqueta, TEXTOS_DE_REVISION } from "@/lib/dominio/biblioteca/lote-de-etiquetas"
import { confirmarEtiquetaAccion } from "../../acciones"
import { EditorDeEtiqueta } from "../../afirmaciones/[id]/editor-de-etiqueta"

const ENLACE = "font-semibold text-tinta underline decoration-1 underline-offset-4"

// A card she finished here comes back done once the page refreshes, remounted under a new key: it takes the focus on its
// review line. Module state, because the card that acted is gone by then; it expires so a later visit never takes it.
let revisionPendiente: { posicion: number; afirmacionId: string; hasta: number } | null = null
const VIDA_DEL_FOCO_MS = 5000

/**
 * One doubtful tag of the week (spec 6c-2): the claim, the tag and why it is here, with «Está bien» and «Cambiar»
 * (the 6c-1 editor, already open). Bordered, not a panel: the editor inside is drawn on piedra-alta.
 */
export function TarjetaDeEtiquetaDudosa({ tarjeta }: { tarjeta: TarjetaDeEtiqueta }) {
  const [cambiando, setCambiando] = useState(false)
  const { pendiente, error, ejecutar } = useAccion()
  const idDelTitulo = `etiqueta-dudosa-${tarjeta.posicion}`
  const cambiarRef = useRef<HTMLButtonElement>(null)
  const revisionRef = useRef<HTMLParagraphElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount, when a card that just became done appears.
  useEffect(() => {
    const pendiente = revisionPendiente
    if (tarjeta.estado !== "hecha" || !pendiente || pendiente.hasta < Date.now()) return
    if (pendiente.posicion !== tarjeta.posicion || pendiente.afirmacionId !== tarjeta.afirmacionId) return
    revisionPendiente = null
    revisionRef.current?.focus()
  }, [])

  function recordarRevision() {
    revisionPendiente = {
      posicion: tarjeta.posicion,
      afirmacionId: tarjeta.afirmacionId,
      hasta: Date.now() + VIDA_DEL_FOCO_MS,
    }
  }

  function alCerrarElEditor(guardado: boolean) {
    if (guardado) recordarRevision()
    setCambiando(false)
    // The editor's own tag button goes away with it: the focus returns to the «Cambiar» that opened it.
    requestAnimationFrame(() => cambiarRef.current?.focus())
  }

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
        {/* While the editor is open it shows the tag right below: the heading stays only to name the card. */}
        <h2 id={idDelTitulo} className={cambiando ? "sr-only" : "text-meta text-apagado"}>
          {tarjeta.titulo}
        </h2>
        {!cambiando && tarjeta.etiqueta ? (
          <p className="text-cuerpo font-semibold text-tinta">{tarjeta.etiqueta}</p>
        ) : null}
        {!cambiando && tarjeta.frase ? <p className="text-meta text-tinta">{`«${tarjeta.frase}»`}</p> : null}
      </div>
      {tarjeta.estado === "hecha" ? (
        <p ref={revisionRef} tabIndex={-1} className="text-meta font-semibold text-tinta">
          {tarjeta.revision}
        </p>
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
          alCerrar={alCerrarElEditor}
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
                  ejecutar(
                    () =>
                      confirmarEtiquetaAccion({
                        afirmacionId: tarjeta.afirmacionId,
                        campo: tarjeta.campo,
                        red: tarjeta.red,
                        marcaId: tarjeta.marcaId,
                      }),
                    recordarRevision,
                  )
                }
              >
                Está bien
              </Boton>
            ) : null}
            <Boton ref={cambiarRef} tamano="chico" onClick={() => setCambiando(true)}>
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
