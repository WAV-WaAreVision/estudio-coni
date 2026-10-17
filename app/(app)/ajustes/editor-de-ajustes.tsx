"use client"

import { Minus, Plus } from "@phosphor-icons/react"
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Chip } from "@/components/chip"
import { Seccion } from "@/components/seccion"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { FilaConInterruptor, FilaConValor } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Medidor } from "@/components/ui/medidor"
import type { CambioDeAjuste } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import { canonicos, DESTINOS, type Destino, nombreDeDestino } from "@/lib/dominio/destinos"
import { dolares } from "@/lib/formato"

export interface AjustesEditables {
  meta: "consultas" | "talleres" | "marca"
  dias: number[]
  hora: string
  tope: number
  usado: number
  avisosResumen: boolean
  avisosUrgentes: boolean
  /** Where reels are published unless she says otherwise at gate 2. */
  destinos: Destino[]
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
    case "destinos":
      return { ...valores, destinos: cambio.valor }
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
    case "destinos":
      return { campo, valor: valores.destinos }
  }
}

interface Mensaje {
  texto: string
  deshacer?: () => void
}

/** Settings edited in place: every change saves by itself and can be undone from the toast (docs/PRODUCT.md). */
export function EditorDeAjustes({
  inicial,
  acciones,
  linkedinConectado,
  avisosDelCelular,
}: {
  inicial: AjustesEditables
  acciones: AccionesDelEditor
  /** A connected LinkedIn posts by itself at the approved time; otherwise it goes by hand. */
  linkedinConectado: boolean
  /** The phone block (install, turn on, test): it belongs to the same «Avisos» section as the switches. */
  avisosDelCelular?: ReactNode
}) {
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

  function alternarDestino(destino: Destino) {
    const puesto = valores.destinos.includes(destino)
    if (puesto && valores.destinos.length === 1) {
      setError("Deja al menos un destino.")
      return
    }
    const siguientes = puesto ? valores.destinos.filter((d) => d !== destino) : [...valores.destinos, destino]
    cambiar({ campo: "destinos", valor: canonicos(siguientes) })
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
    <div>
      <Seccion titulo="Publicación" id="ajuste-publicacion">
        <Grupo>
          <FilaConValor
            etiqueta="Meta de este mes"
            valor={valores.meta}
            opciones={METAS}
            alCambiar={(valor) => cambiar({ campo: "meta", valor })}
          />
        </Grupo>
        <h3 className="mx-0.5 mt-2 text-meta font-semibold">Días de publicación</h3>
        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((dia) => (
            <Chip
              key={dia.numero}
              className="px-0"
              conCheck={false}
              presionado={valores.dias.includes(dia.numero)}
              onClick={() => alternarDia(dia.numero)}
            >
              {dia.etiqueta}
            </Chip>
          ))}
        </div>
        <Grupo>
          <FilaConValor
            tipo="time"
            etiqueta="Hora de publicación"
            titulo="A las"
            sufijo="hora de Chile"
            valor={valores.hora}
            alCambiar={(hora) => {
              setValores((actuales) => ({ ...actuales, hora }))
              if (hora && hora !== ultimos.current.hora) cambiar({ campo: "hora", valor: hora })
            }}
          />
        </Grupo>
      </Seccion>

      <Seccion titulo="Dónde se publica" id="ajuste-destinos">
        <Grupo>
          {DESTINOS.map((destino) => (
            <FilaConInterruptor
              key={destino}
              etiqueta={nombreDeDestino(destino)}
              detalle={destino === "linkedin" ? (linkedinConectado ? "Sale solo" : "A mano") : undefined}
              encendido={valores.destinos.includes(destino)}
              alCambiar={() => alternarDestino(destino)}
            />
          ))}
        </Grupo>
        <p className="text-meta text-apagado">
          Si LinkedIn está conectado, a la hora aprobada sale solo. Si no, te aviso y te dejo el video y el texto listos
          para subirlo a mano.
        </p>
      </Seccion>

      <Seccion titulo="Tope de gasto al mes" id="ajuste-tope">
        <div className="flex min-h-fila-baja items-center justify-between gap-3">
          <span className="text-cuerpo">Tope</span>
          <div className="flex items-center gap-3">
            <Boton
              variante="secundario"
              tamano="chico"
              aria-label="Bajar el tope"
              deshabilitado={valores.tope <= 0}
              className="w-objetivo justify-center px-0"
              onClick={() => moverTope(-PASO_DEL_TOPE_USD)}
            >
              <Minus aria-hidden="true" size={ICONO.medio} />
            </Boton>
            <output className="min-w-20 text-center text-pieza tabular-nums">{`US$ ${valores.tope}`}</output>
            <Boton
              variante="secundario"
              tamano="chico"
              aria-label="Subir el tope"
              deshabilitado={valores.tope >= MAXIMO_DEL_TOPE_USD}
              className="w-objetivo justify-center px-0"
              onClick={() => moverTope(PASO_DEL_TOPE_USD)}
            >
              <Plus aria-hidden="true" size={ICONO.medio} />
            </Boton>
          </div>
        </div>
        <Medidor gastado={valores.usado} tope={valores.tope} texto={`Llevas ${dolares(valores.usado)} este mes`} />
      </Seccion>

      <Seccion titulo="Avisos" id="ajuste-avisos">
        <Grupo>
          <FilaConInterruptor
            etiqueta="Resumen diario a las 08:30"
            encendido={valores.avisosResumen}
            alCambiar={(valor) => cambiar({ campo: "avisos_resumen", valor })}
          />
          <FilaConInterruptor
            etiqueta="Avisarme apenas falle algo"
            encendido={valores.avisosUrgentes}
            alCambiar={(valor) => cambiar({ campo: "avisos_urgentes", valor })}
          />
        </Grupo>
        <p className="text-meta text-apagado">Los cambios se guardan solos. Lo que ya aprobaste mantiene su fecha.</p>
        {avisosDelCelular ? <div className="mt-4">{avisosDelCelular}</div> : null}
      </Seccion>

      {error ? (
        <div className="mt-6">
          <LineaDeEstado tipo="error" titulo={error} />
        </div>
      ) : null}

      {mensaje ? <Aviso mensaje={mensaje.texto} alCerrar={cerrarMensaje} alDeshacer={mensaje.deshacer} /> : null}
    </div>
  )
}
