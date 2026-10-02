"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useState, useTransition } from "react"
import { editarGuionAccion, volverAVersionDeClaudeAccion } from "@/app/(app)/piezas/acciones"
import { Boton } from "@/components/ui/boton"
import { MarcaRevision } from "@/components/ui/marca-revision"
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

const CAJA =
  "w-full rounded-lg border-[1.5px] border-linea bg-superficie p-3.5 text-[1.0625rem] leading-normal focus:border-acento"

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
    })
  }

  function guardar() {
    const enviado = borrador
    setGuardando(true)
    correr(() => editarGuionAccion(piezaId, version, enviado.guion, enviado.texto), enviado)
  }

  function restaurar() {
    setConfirmando(false)
    setGuardando(false)
    correr(() => volverAVersionDeClaudeAccion(piezaId, version))
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={idGuion} className="text-label font-semibold text-apagado">
          Guion
        </label>
        <textarea
          id={idGuion}
          value={borrador.guion}
          onChange={(evento) => cambiar("guion", evento.target.value)}
          rows={12}
          maxLength={MAXIMO_DEL_GUION}
          className={`${CAJA} font-serif text-script`}
        />
        <p aria-live="polite" className="flex flex-wrap gap-x-3 text-meta text-apagado">
          <span>
            {palabras} palabras · ≈ {segundos} s
          </span>
          <span className="font-semibold text-tinta">{ESTADOS[estadoDeLargo(palabras)]}</span>
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={idTexto} className="text-label font-semibold text-apagado">
          Texto de la publicación
        </label>
        <textarea
          id={idTexto}
          value={borrador.texto}
          onChange={(evento) => cambiar("texto", evento.target.value)}
          rows={8}
          maxLength={MAXIMO_DEL_TEXTO}
          className={CAJA}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
          {error}
        </p>
      ) : null}
      {estado.tipo === "bloqueado" ? (
        <div className="grid gap-2.5">
          {estado.hallazgos.map((hallazgo) => (
            <MarcaRevision
              key={`${hallazgo.regla}|${hallazgo.frase ?? ""}|${hallazgo.mensaje}`}
              hallazgo={hallazgo}
              confirmada={false}
              alCambiar={() => undefined}
            />
          ))}
        </div>
      ) : null}
      {estado.tipo === "guardado" ? (
        <output className="block text-label font-semibold text-acento">
          Guardado
          {estado.observaciones > 0 ? (
            <span className="font-normal text-apagado">
              {" "}
              · Claude lo revisó: {estado.observaciones} {estado.observaciones === 1 ? "observación" : "observaciones"}{" "}
              para confirmar abajo, en Revisión.
            </span>
          ) : null}
        </output>
      ) : null}

      <Boton cargando={pendiente && guardando} deshabilitado={!sinGuardar || pendiente} onClick={guardar}>
        {pendiente && guardando ? "Guardando…" : "Guardar cambios"}
      </Boton>

      {tieneVersionDeClaude ? (
        confirmando ? (
          <div className="grid gap-2 rounded-md bg-acento-suave p-3.5">
            <p className="text-[1rem]">¿Volver al guion que escribió Claude? Se guarda como una versión nueva.</p>
            <Boton cargando={pendiente} onClick={restaurar}>
              Sí, volver
            </Boton>
            <Boton variante="callado" onClick={() => setConfirmando(false)}>
              Cancelar
            </Boton>
          </div>
        ) : (
          <Boton variante="callado" onClick={() => setConfirmando(true)}>
            Volver a la versión de Claude
          </Boton>
        )
      ) : null}
    </div>
  )
}
