"use client"

import { Check } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { editarGuionAccion, volverAVersionDeClaudeAccion } from "@/app/(app)/piezas/acciones"
import { AyudaDeMarcas } from "@/components/ayuda-de-marcas"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MarcaRevision } from "@/components/ui/marca-revision"
import { useAutoAlto } from "@/components/use-auto-alto"
import type { ResultadoDeGuion } from "@/lib/acciones/guion"
import { ERROR_SESION_VENCIDA } from "@/lib/acciones/resultado"
import { contarPalabras, estadoDeLargo, estimarSegundos } from "@/lib/dominio/duracion"
import { type Hallazgo, MAXIMO_DEL_GUION } from "@/lib/dominio/revision"

// The server enforces the same limit (MAXIMO_DEL_TEXTO); here it only caps the box.
const MAXIMO_DEL_TEXTO = 2200

const ESTADOS = { corto: "Un poco corto", bien: "Bien", largo: "Un poco largo" } as const

export interface GuionGuardado {
  version: number
  revision: Hallazgo[]
}

interface PropiedadesDelEditor {
  piezaId: string
  /** The version she is looking at: an edit or a restore is refused if the piece moved on. */
  version: number
  guion: string
  texto: string
  tieneVersionDeClaude: boolean
  alGuardar: (guardado: GuionGuardado) => void
  alCambiarSinGuardar: (sinGuardar: boolean) => void
}

type Estado =
  | { tipo: "nada" }
  | { tipo: "guardado"; observaciones: number }
  | { tipo: "bloqueado"; hallazgos: Hallazgo[] }

/** Gate 1 editor: the script and the caption as two boxes, a length hint, and a way back to what Claude wrote. */
export function EditorDeGuion({
  piezaId,
  version,
  guion,
  texto,
  tieneVersionDeClaude,
  alGuardar,
  alCambiarSinGuardar,
}: PropiedadesDelEditor) {
  const idGuion = useId()
  const idTexto = useId()
  const [borrador, setBorrador] = useState({ guion, texto })
  const [base, setBase] = useState({ guion, texto })
  const [vistos, setVistos] = useState({ guion, texto })
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" })
  const [confirmando, setConfirmando] = useState(false)
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cajaGuion = useRef<HTMLTextAreaElement>(null)
  const cajaTexto = useRef<HTMLTextAreaElement>(null)
  useAutoAlto(cajaGuion, borrador.guion)
  useAutoAlto(cajaTexto, borrador.texto)

  // The screen sent other texts (a restore came back): they are the new starting point.
  if (vistos.guion !== guion || vistos.texto !== texto) {
    setVistos({ guion, texto })
    setBorrador({ guion, texto })
    setBase({ guion, texto })
  }

  function cambiar(campo: "guion" | "texto", valor: string) {
    setBorrador({ ...borrador, [campo]: valor })
    // What the review refused was the text she just changed: the notice no longer describes the box.
    if (estado.tipo === "bloqueado") setEstado({ tipo: "nada" })
    setError(null)
  }

  const sinGuardar = borrador.guion !== base.guion || borrador.texto !== base.texto
  useEffect(() => alCambiarSinGuardar(sinGuardar), [sinGuardar, alCambiarSinGuardar])

  const palabras = contarPalabras(borrador.guion)
  const segundos = Math.round(estimarSegundos(borrador.guion))

  function correr(accion: () => Promise<ResultadoDeGuion>, enviado?: { guion: string; texto: string }) {
    setError(null)
    setEstado({ tipo: "nada" })
    empezar(async () => {
      try {
        const r = await accion()
        if (!r.ok) {
          if (r.error === ERROR_SESION_VENCIDA) router.push("/ingreso")
          else {
            setError(r.error)
            if (r.motivo === "revision_bloquea" && r.hallazgos) setEstado({ tipo: "bloqueado", hallazgos: r.hallazgos })
          }
          return
        }
        if (enviado) setBase(enviado)
        setEstado({ tipo: "guardado", observaciones: r.revision.filter((h) => h.tipo === "advierte").length })
        alGuardar({ version: r.version, revision: r.revision })
      } finally {
        setGuardando(false)
      }
    })
  }

  function guardar() {
    const enviado = borrador
    setGuardando(true)
    correr(() => editarGuionAccion(piezaId, version, enviado.guion, enviado.texto), enviado)
  }

  function restaurar() {
    setConfirmando(false)
    correr(() => volverAVersionDeClaudeAccion(piezaId, version))
  }

  const largoDelTexto = [...borrador.texto].length
  const estadoDelLargo = estadoDeLargo(palabras)
  return (
    <>
      <Seccion
        titulo="Guion"
        id={idGuion}
        cifra={
          <span aria-live="polite" className="inline-flex flex-wrap items-center justify-end gap-x-2">
            <span>
              {palabras} palabras · ≈ {segundos} s
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-tinta">
              {estadoDelLargo === "bien" ? (
                <Check aria-hidden="true" size={ICONO.chico} className="text-tinta" />
              ) : null}
              {ESTADOS[estadoDelLargo]}
            </span>
          </span>
        }
      >
        <textarea
          ref={cajaGuion}
          aria-labelledby={idGuion}
          value={borrador.guion}
          onChange={(evento) => cambiar("guion", evento.target.value)}
          maxLength={MAXIMO_DEL_GUION}
          className="campo w-full text-guion"
        />
        <AyudaDeMarcas />
        {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
        {estado.tipo === "bloqueado" ? (
          <div className="grid gap-4">
            {estado.hallazgos.map((hallazgo) => (
              <MarcaRevision
                key={`${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`}
                hallazgo={hallazgo}
                confirmada={false}
                alCambiar={() => undefined}
                anunciada
              />
            ))}
          </div>
        ) : null}
        {estado.tipo === "guardado" ? (
          <LineaDeEstado
            tipo="exito"
            titulo="Guardado"
            detalle={
              estado.observaciones > 0
                ? `Claude lo revisó: ${estado.observaciones} ${estado.observaciones === 1 ? "observación" : "observaciones"} para confirmar abajo, en Revisión.`
                : undefined
            }
          />
        ) : null}
        <Boton
          variante="secundario"
          cargando={pendiente && guardando}
          deshabilitado={!sinGuardar || pendiente}
          onClick={guardar}
        >
          {pendiente && guardando ? "Guardando…" : "Guardar cambios"}
        </Boton>
        {tieneVersionDeClaude ? (
          confirmando ? (
            <ConfirmacionEnLinea
              trato="neutro"
              pregunta="¿Volver al guion que escribió Claude? Se guarda como una versión nueva."
              confirmar="Sí, volver"
              volver="Cancelar"
              cargando={pendiente}
              alConfirmar={restaurar}
              alVolver={() => setConfirmando(false)}
            />
          ) : (
            <Boton variante="callado" onClick={() => setConfirmando(true)}>
              Volver a la versión de Claude
            </Boton>
          )
        ) : null}
      </Seccion>

      <Seccion
        titulo="Texto de la publicación"
        id={idTexto}
        cifra={`${largoDelTexto.toLocaleString("es-CL")} de ${MAXIMO_DEL_TEXTO.toLocaleString("es-CL")}`}
      >
        <textarea
          ref={cajaTexto}
          aria-labelledby={idTexto}
          value={borrador.texto}
          onChange={(evento) => cambiar("texto", evento.target.value)}
          maxLength={MAXIMO_DEL_TEXTO}
          className="campo w-full text-cuerpo"
        />
      </Seccion>
    </>
  )
}
