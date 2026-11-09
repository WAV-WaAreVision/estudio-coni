"use client"

import { UploadSimple } from "@phosphor-icons/react"
import { useId, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { ImportacionDeLinkedin } from "@/lib/acciones/excel-linkedin"
import type { Resultado } from "@/lib/acciones/resultado"
import {
  COMO_DESCARGARLO,
  diaEnPalabras,
  ERROR_MUY_GRANDE,
  etiquetaDeOpcion,
  TAMANO_MAXIMO,
} from "@/lib/metricas/excel-linkedin/resumen"

export interface EntradaDeDudosos {
  medidoEn: string
  elegidos: { piezaId: string; clave: string; impresiones: number | null; interacciones: number | null }[]
}

interface Propiedades {
  alImportar: (formulario: FormData) => Promise<Resultado<ImportacionDeLinkedin>>
  alGuardarDudosos: (entrada: EntradaDeDudosos) => Promise<Resultado<{ resumen: string[] }>>
}

const ACEPTA = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function Lineas({ lineas }: { lineas: readonly string[] }) {
  const [titulo, ...resto] = lineas
  if (!titulo) return null
  return (
    <LineaDeEstado
      tipo="neutro"
      titulo={titulo}
      detalle={
        resto.length > 0 ? (
          <span className="grid gap-1">
            {resto.map((linea) => (
              <span key={linea}>{linea}</span>
            ))}
          </span>
        ) : undefined
      }
    />
  )
}

/**
 * Change 13a: Coni uploads the Excel LinkedIn gives her and the numbers land on each piece. No confirm step
 * (decision 4); the doubtful hand uploads are picked here, inline, with no modal.
 */
export function ImportarExcelDeLinkedin({ alImportar, alGuardarDudosos }: Propiedades) {
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const [importacion, setImportacion] = useState<ImportacionDeLinkedin | null>(null)
  const [elegidas, setElegidas] = useState<Record<string, string>>({})
  const [guardado, setGuardado] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const { pendiente, error, ejecutar } = useAccion()

  function subir(archivo: File | undefined) {
    if (!archivo) return
    setImportacion(null)
    setGuardado(null)
    setElegidas({})
    if (archivo.size > TAMANO_MAXIMO) {
      setAviso(ERROR_MUY_GRANDE)
      return
    }
    setAviso(null)
    const formulario = new FormData()
    formulario.set("archivo", archivo)
    ejecutar(
      () => alImportar(formulario),
      (resultado) =>
        setImportacion({ medidoEn: resultado.medidoEn, resumen: resultado.resumen, dudosos: resultado.dudosos }),
    )
  }

  function guardarDudosos() {
    if (!importacion) return
    const elegidos = importacion.dudosos.flatMap((dudoso) => {
      const opcion = dudoso.opciones.find((posible) => posible.clave === elegidas[dudoso.piezaId])
      return opcion
        ? [
            {
              piezaId: dudoso.piezaId,
              clave: opcion.clave,
              impresiones: opcion.impresiones,
              interacciones: opcion.interacciones,
            },
          ]
        : []
    })
    if (elegidos.length === 0) {
      setAviso("Elige el post del Excel de al menos una publicación.")
      return
    }
    setAviso(null)
    ejecutar(
      () => alGuardarDudosos({ medidoEn: importacion.medidoEn, elegidos }),
      (resultado) => {
        setGuardado(resultado.resumen)
        const resueltas = new Set(elegidos.map((elegido) => elegido.piezaId))
        setImportacion({ ...importacion, dudosos: importacion.dudosos.filter((d) => !resueltas.has(d.piezaId)) })
      },
    )
  }

  const tomadas = new Set(Object.values(elegidas).filter((clave) => clave !== ""))
  const mensaje = aviso ?? error

  return (
    <div className="grid gap-4">
      <p className="grid gap-1 text-meta text-apagado">
        {COMO_DESCARGARLO.map((linea) => (
          <span key={linea}>{linea}</span>
        ))}
      </p>
      {/* Never the native "Choose File" (as in Biblioteca): the button opens it. */}
      <input
        ref={entrada}
        type="file"
        hidden
        accept={ACEPTA}
        aria-label="Excel de LinkedIn"
        onChange={(evento) => {
          subir(evento.target.files?.[0])
          evento.target.value = ""
        }}
      />
      <Boton
        variante="secundario"
        cargando={pendiente}
        icono={<UploadSimple aria-hidden="true" size={ICONO.medio} />}
        onClick={() => entrada.current?.click()}
      >
        Importar Excel de LinkedIn
      </Boton>
      {mensaje ? <LineaDeEstado tipo="error" titulo={mensaje} tituloEnTinta /> : null}
      {importacion ? <Lineas lineas={importacion.resumen} /> : null}
      {importacion && importacion.dudosos.length > 0 ? (
        <div className="grid gap-4">
          <ul className="grid gap-4">
            {importacion.dudosos.map((dudoso) => {
              const campo = `${id}-${dudoso.piezaId}`
              return (
                <li key={dudoso.piezaId} className="grid gap-1">
                  <label htmlFor={campo} className="text-cuerpo font-semibold">
                    {dudoso.titulo}
                  </label>
                  <span className="text-meta text-apagado">{`Subida a mano el ${diaEnPalabras(dudoso.fecha)}`}</span>
                  <select
                    id={campo}
                    className="campo w-full text-cuerpo"
                    value={elegidas[dudoso.piezaId] ?? ""}
                    onChange={(evento) => setElegidas((antes) => ({ ...antes, [dudoso.piezaId]: evento.target.value }))}
                  >
                    <option value="">Elige el post del Excel</option>
                    {dudoso.opciones.map((opcion) => (
                      <option
                        key={opcion.clave}
                        value={opcion.clave}
                        disabled={tomadas.has(opcion.clave) && elegidas[dudoso.piezaId] !== opcion.clave}
                      >
                        {etiquetaDeOpcion(opcion)}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
          <Boton variante="secundario" cargando={pendiente} onClick={guardarDudosos}>
            Guardar
          </Boton>
        </div>
      ) : null}
      {guardado ? <Lineas lineas={guardado} /> : null}
    </div>
  )
}
