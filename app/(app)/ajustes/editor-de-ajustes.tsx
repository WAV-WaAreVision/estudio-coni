"use client"

import { Minus, Plus } from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Chip } from "@/components/chip"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { Segmentado } from "@/components/ui/segmentado"
import type { CambioDeAjuste } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import { dolares } from "@/lib/formato"

export interface AjustesEditables {
  meta: "consultas" | "talleres" | "marca"
  dias: number[]
  hora: string
  tope: number
  usado: number
  avisosResumen: boolean
  avisosUrgentes: boolean
}

export interface AccionesDelEditor {
  guardar: (cambio: CambioDeAjuste) => Promise<Resultado<{ anterior: CambioDeAjuste; aviso?: string }>>
}

const METAS = [
  { valor: "consultas", etiqueta: "Consultas" },
  { valor: "talleres", etiqueta: "Talleres" },
  { valor: "marca", etiqueta: "Marca" },
] as const

const DIAS = [
  { numero: 1, etiqueta: "Lun" },
  { numero: 2, etiqueta: "Mar" },
  { numero: 3, etiqueta: "Mié" },
  { numero: 4, etiqueta: "Jue" },
  { numero: 5, etiqueta: "Vie" },
  { numero: 6, etiqueta: "Sáb" },
  { numero: 7, etiqueta: "Dom" },
] as const

const PASO_DEL_TOPE_USD = 5
const MAXIMO_DEL_TOPE_USD = 500
// She taps the stepper a few times: one save and one line in the log, once she stops.
const ESPERA_DEL_TOPE_MS = 600

function aplicar(valores: AjustesEditables, cambio: CambioDeAjuste): AjustesEditables {
  switch (cambio.campo) {
    case "meta":
      return { ...valores, meta: cambio.valor }
    case "dias":
      return { ...valores, dias: cambio.valor }
    case "hora":
      return { ...valores, hora: cambio.valor }
    case "tope":
      return { ...valores, tope: cambio.valor }
    case "avisos_resumen":
      return { ...valores, avisosResumen: cambio.valor }
    case "avisos_urgentes":
      return { ...valores, avisosUrgentes: cambio.valor }
  }
}

function valorDe(valores: AjustesEditables, campo: CambioDeAjuste["campo"]): CambioDeAjuste {
  switch (campo) {
    case "meta":
      return { campo, valor: valores.meta }
    case "dias":
      return { campo, valor: valores.dias }
    case "hora":
      return { campo, valor: valores.hora }
    case "tope":
      return { campo, valor: valores.tope }
    case "avisos_resumen":
      return { campo, valor: valores.avisosResumen }
    case "avisos_urgentes":
      return { campo, valor: valores.avisosUrgentes }
  }
}

interface Mensaje {
  texto: string
  deshacer?: () => void
}

/** Settings edited in place: every change saves by itself and can be undone from the toast (docs/PRODUCT.md). */
export function EditorDeAjustes({ inicial, acciones }: { inicial: AjustesEditables; acciones: AccionesDelEditor }) {
  const [valores, setValores] = useState(inicial)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, empezar] = useTransition()
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  // The latest values, for the callbacks that run later (the cap's timer, the undo).
  const ultimos = useRef(valores)
  ultimos.current = valores
  const temporizadorDelTope = useRef<ReturnType<typeof setTimeout> | null>(null)
  const topeAntesDeTocar = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (temporizadorDelTope.current) clearTimeout(temporizadorDelTope.current)
    },
    [],
  )

  function enviar(cambio: CambioDeAjuste, antes: CambioDeAjuste) {
    setError(null)
    setValores((actuales) => aplicar(actuales, cambio))
    empezar(async () => {
      const resultado = await acciones.guardar(cambio)
      if (!resultado.ok) {
        setValores((actuales) => aplicar(actuales, antes))
        setError(resultado.error)
        return
      }
      setMensaje({ texto: resultado.aviso ?? "Guardado", deshacer: () => deshacer(resultado.anterior) })
    })
  }

  function deshacer(anterior: CambioDeAjuste) {
    setValores((actuales) => aplicar(actuales, anterior))
    empezar(async () => {
      const resultado = await acciones.guardar(anterior)
      if (!resultado.ok) setError(resultado.error)
    })
  }

  function cambiar(cambio: CambioDeAjuste) {
    enviar(cambio, valorDe(ultimos.current, cambio.campo))
  }

  function alternarDia(numero: number) {
    const puestos = valores.dias.includes(numero)
    if (puestos && valores.dias.length === 1) {
      setError("Deja al menos un día de publicación.")
      return
    }
    const siguientes = puestos ? valores.dias.filter((dia) => dia !== numero) : [...valores.dias, numero]
    cambiar({ campo: "dias", valor: siguientes.sort((a, b) => a - b) })
  }

  function moverTope(delta: number) {
    const nuevo = Math.min(MAXIMO_DEL_TOPE_USD, Math.max(0, ultimos.current.tope + delta))
    if (topeAntesDeTocar.current === null) topeAntesDeTocar.current = ultimos.current.tope
    setError(null)
    setValores((actuales) => ({ ...actuales, tope: nuevo }))
    if (temporizadorDelTope.current) clearTimeout(temporizadorDelTope.current)
    temporizadorDelTope.current = setTimeout(() => {
      const antes: CambioDeAjuste = { campo: "tope", valor: topeAntesDeTocar.current ?? nuevo }
      topeAntesDeTocar.current = null
      enviar({ campo: "tope", valor: ultimos.current.tope }, antes)
    }, ESPERA_DEL_TOPE_MS)
  }

  return (
    <div className="grid gap-5.5">
      <section aria-labelledby="ajuste-meta" className="grid gap-2">
        <h2 id="ajuste-meta" className="text-label font-semibold text-apagado">
          Meta de este mes
        </h2>
        <Segmentado
          nombre="Meta de este mes"
          opciones={METAS}
          valor={valores.meta}
          alCambiar={(valor) => cambiar({ campo: "meta", valor })}
        />
      </section>

      <section aria-labelledby="ajuste-dias" className="grid gap-2">
        <h2 id="ajuste-dias" className="text-label font-semibold text-apagado">
          Días de publicación
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map((dia) => (
            <Chip
              key={dia.numero}
              presionado={valores.dias.includes(dia.numero)}
              onClick={() => alternarDia(dia.numero)}
            >
              {dia.etiqueta}
            </Chip>
          ))}
        </div>
        <label className="flex flex-wrap items-center gap-2.5 text-meta text-apagado" htmlFor="hora-de-publicacion">
          A las
          <input
            id="hora-de-publicacion"
            type="time"
            aria-label="Hora de publicación"
            value={valores.hora}
            onChange={(evento) => setValores((actuales) => ({ ...actuales, hora: evento.target.value }))}
            onBlur={(evento) => {
              const hora = evento.target.value
              if (hora && hora !== inicial.hora) cambiar({ campo: "hora", valor: hora })
            }}
            className="min-h-11 rounded-md border border-linea bg-superficie px-3 text-body text-tinta"
          />
          hora de Chile
        </label>
      </section>

      <section aria-labelledby="ajuste-tope" className="grid gap-2">
        <h2 id="ajuste-tope" className="text-label font-semibold text-apagado">
          Tope de gasto al mes
        </h2>
        <div className="grid grid-cols-[44px_auto_44px] items-center gap-2.5">
          <Boton
            variante="linea"
            tamano="chico"
            aria-label="Bajar el tope"
            deshabilitado={valores.tope <= 0}
            className="px-0"
            onClick={() => moverTope(-PASO_DEL_TOPE_USD)}
          >
            <Minus aria-hidden="true" size={20} />
          </Boton>
          <output className="min-w-[4.5rem] text-center text-[1.25rem] font-semibold tabular-nums">
            {`US$ ${valores.tope}`}
          </output>
          <Boton
            variante="linea"
            tamano="chico"
            aria-label="Subir el tope"
            deshabilitado={valores.tope >= MAXIMO_DEL_TOPE_USD}
            className="px-0"
            onClick={() => moverTope(PASO_DEL_TOPE_USD)}
          >
            <Plus aria-hidden="true" size={20} />
          </Boton>
        </div>
        <p className="text-meta text-apagado">Llevas {dolares(valores.usado)} este mes</p>
      </section>

      <section aria-labelledby="ajuste-avisos" className="grid gap-1">
        <h2 id="ajuste-avisos" className="text-label font-semibold text-apagado">
          Avisos
        </h2>
        <label className="grid min-h-13 grid-cols-[1fr_auto] items-center gap-3">
          <span>Resumen diario a las 08:30</span>
          <input
            type="checkbox"
            className="size-6 accent-acento"
            checked={valores.avisosResumen}
            onChange={(evento) => cambiar({ campo: "avisos_resumen", valor: evento.target.checked })}
          />
        </label>
        <label className="grid min-h-13 grid-cols-[1fr_auto] items-center gap-3">
          <span>Avisarme apenas falle algo</span>
          <input
            type="checkbox"
            className="size-6 accent-acento"
            checked={valores.avisosUrgentes}
            onChange={(evento) => cambiar({ campo: "avisos_urgentes", valor: evento.target.checked })}
          />
        </label>
      </section>

      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
          {error}
        </p>
      ) : null}
      <p className="text-meta text-apagado">Los cambios se guardan solos. Lo que ya aprobaste mantiene su fecha.</p>

      {mensaje ? <Aviso mensaje={mensaje.texto} alCerrar={cerrarMensaje} alDeshacer={mensaje.deshacer} /> : null}
    </div>
  )
}
