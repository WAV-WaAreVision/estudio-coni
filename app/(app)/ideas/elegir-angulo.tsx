"use client"

import { useId, useRef, useState } from "react"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { useRedibujar } from "@/components/use-redibujar"
import type { Resultado } from "@/lib/acciones/resultado"
import type { OpcionDeAngulo } from "@/lib/dominio/pilares"
import { Campo, CLASES_DE_CAMPO } from "../biblioteca/campo"

export const SIN_ANGULO = "Sin ángulo"
export const ANGULO_GUARDADO = "Listo, guardé el ángulo."

interface Propiedades {
  ideaId: string
  /** The angles of the idea's pillar; none renders nothing. */
  angulos: readonly OpcionDeAngulo[]
  /** The id of the idea's angle, or null. */
  elegido: string | null
  cambiar: (ideaId: string, anguloId: string | null) => Promise<Resultado>
}

/**
 * The idea's angle, changed in place (spec 15d, section 3; plan decision 6): choosing saves at once, the field is
 * disabled while it saves, a refusal puts the old angle back and says why, and success redraws the screen with fresh
 * data (`useRedibujar`), never another address.
 */
export function ElegirAngulo({ ideaId, angulos, elegido, cambiar }: Propiedades) {
  const [valor, setValor] = useState(elegido ?? "")
  const [guardado, setGuardado] = useState(false)
  const { pendiente, error, ejecutar } = useAccion()
  const redibujar = useRedibujar()
  // The transition's pending state lags a render; two changes in the same tick must still save once.
  const guardando = useRef(false)
  const id = useId()

  if (angulos.length === 0) return null

  function cambiarA(nuevo: string) {
    if (guardando.current || pendiente || nuevo === valor) return
    guardando.current = true
    const anterior = valor
    setValor(nuevo)
    setGuardado(false)
    ejecutar(
      () =>
        cambiar(ideaId, nuevo === "" ? null : nuevo).finally(() => {
          guardando.current = false
        }),
      () => {
        setGuardado(true)
        redibujar()
      },
      () => setValor(anterior),
    )
  }

  return (
    <div className="grid gap-2">
      <Campo id={id} etiqueta="Ángulo">
        <select
          id={id}
          value={valor}
          disabled={pendiente}
          onChange={(evento) => cambiarA(evento.target.value)}
          className={CLASES_DE_CAMPO}
        >
          {angulos.map((angulo) => (
            <option key={angulo.id} value={angulo.id}>
              {angulo.nombre}
            </option>
          ))}
          <option value="">{SIN_ANGULO}</option>
        </select>
      </Campo>
      {/* Always mounted so the note is announced; empty, it is out of the layout. */}
      <div aria-live="polite" aria-atomic="true" className="empty:sr-only">
        {guardado ? <LineaDeEstado tipo="neutro" titulo={ANGULO_GUARDADO} enVivo={false} /> : null}
      </div>
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
    </div>
  )
}
