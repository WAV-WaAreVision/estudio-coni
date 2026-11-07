"use client"

import { EnvelopeSimple } from "@phosphor-icons/react"
import { useState } from "react"
import { avisarAFedericoAccion } from "@/app/(app)/acciones-avisar"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { ETIQUETA_AVISAR, TEXTO_LE_AVISE, type TipoDeAviso } from "@/lib/dominio/avisar-a-federico"
import { cn } from "@/lib/utils"

interface PropiedadesDeAvisar {
  tipo: TipoDeAviso
  id: string
  /** WAV's email for this failure already went out (the server page reads it). */
  avisado: boolean
  /** Placement from the block around it. */
  className?: string
}

/**
 * Spec 2026-11-07, decision 6: where a failure only WAV can fix is shown, she tells Federico with one tap. The action
 * reads the failure itself and sends one email however many taps; the screen then says he knows.
 */
export function AvisarAFederico({ tipo, id, avisado, className }: PropiedadesDeAvisar) {
  const avisar = useAccion()
  const [listo, setListo] = useState(avisado)

  if (listo) return <LineaDeEstado tipo="exito" titulo={TEXTO_LE_AVISE} className={className} />
  return (
    <div className={cn("grid gap-2", className)}>
      <Boton
        variante="secundario"
        tamano="chico"
        className="w-full"
        icono={<EnvelopeSimple aria-hidden="true" size={ICONO.medio} />}
        cargando={avisar.pendiente}
        onClick={() =>
          avisar.ejecutar(
            () => avisarAFedericoAccion({ tipo, id }),
            () => setListo(true),
          )
        }
      >
        {ETIQUETA_AVISAR}
      </Boton>
      {avisar.error ? <LineaDeError>{avisar.error}</LineaDeError> : null}
    </div>
  )
}
