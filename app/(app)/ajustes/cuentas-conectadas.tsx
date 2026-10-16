"use client"

import { CheckCircle, Info, Warning, WarningCircle } from "@phosphor-icons/react"
import { type FormEvent, useCallback, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import type { EstadoDeLlave } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import type { FilaDeCuenta } from "@/lib/ajustes/presentar"
import { cn } from "@/lib/utils"

const TINTA: Record<FilaDeCuenta["tono"], string> = {
  ok: "text-exito",
  aviso: "text-aviso",
  error: "text-error",
  neutro: "text-tinta",
}
const ICONO_POR_TONO = { ok: CheckCircle, aviso: Warning, error: WarningCircle, neutro: Info } as const

const MENSAJE_DE_LLAVE: Record<EstadoDeLlave, string> = {
  comprobada: "Guardada y comprobada.",
  sin_comprobar: "Guardada. No pude comprobarla ahora, la reviso más tarde.",
  sin_voz: "Guardada. Falta tu voz de ElevenLabs: avísale a Federico.",
}

interface PropiedadesDeCuentas {
  filas: readonly FilaDeCuenta[]
  guardarLlave: (cuenta: string, llave: string) => Promise<Resultado<{ estado: EstadoDeLlave }>>
  desconectarLinkedin: () => Promise<Resultado>
}

export function CuentasConectadas({ filas, guardarLlave, desconectarLinkedin }: PropiedadesDeCuentas) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  // Stable, so a re-render while the toast is up does not restart its 8 s.
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  return (
    <div className="grid">
      <ul className="grid">
        {filas.map((fila) => (
          <li
            key={fila.cuenta}
            id={`cuenta-${fila.cuenta}`}
            className="scroll-mt-4 border-b border-linea py-3 last:border-b-0"
          >
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-cuerpo font-semibold">{fila.nombre}</span>
              <Estado fila={fila} />
            </div>
            {fila.detalle ? <p className="text-meta text-apagado">{fila.detalle}</p> : null}
            {fila.cuenta === "linkedin" ? (
              <FilaDeLinkedin
                fila={fila}
                desconectar={desconectarLinkedin}
                alDesconectar={() =>
                  setMensaje(
                    "LinkedIn quedó desconectado. Si quieres, también puedes quitar el permiso desde la configuración de tu cuenta de LinkedIn.",
                  )
                }
              />
            ) : fila.cuenta === "instagram" ? (
              // A plain link: the route answers with a redirect to Instagram, which a client navigation cannot follow.
              <a
                href="/api/meta/conectar"
                className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "mt-1.5 w-fit" })}
              >
                {fila.tono === "aviso" && fila.estado === "Falta" ? "Conectar Instagram" : "Renovar Instagram"}
              </a>
            ) : abierta === fila.cuenta ? (
              <FormularioDeLlave
                fila={fila}
                guardarLlave={guardarLlave}
                alGuardar={(estado) => {
                  setAbierta(null)
                  setMensaje(MENSAJE_DE_LLAVE[estado])
                }}
                alCancelar={() => setAbierta(null)}
              />
            ) : (
              <Boton variante="linea" tamano="chico" className="mt-1.5" onClick={() => setAbierta(fila.cuenta)}>
                {fila.estado === "Falta" ? `Agregar la llave de ${fila.nombre}` : `Cambiar la llave de ${fila.nombre}`}
              </Boton>
            )}
          </li>
        ))}
      </ul>
      {mensaje ? <Aviso mensaje={mensaje} alCerrar={cerrarMensaje} /> : null}
    </div>
  )
}

function FilaDeLinkedin({
  fila,
  desconectar,
  alDesconectar,
}: {
  fila: FilaDeCuenta
  desconectar: () => Promise<Resultado>
  alDesconectar: () => void
}) {
  const [preguntando, setPreguntando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const enlace = (
    <a
      href="/api/linkedin/conectar"
      className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "w-fit" })}
    >
      {fila.conectada ? "Renovar LinkedIn" : "Conectar LinkedIn"}
    </a>
  )
  if (!fila.conectada) return <div className="mt-1.5">{enlace}</div>
  if (preguntando) {
    return (
      <div className="mt-2 grid gap-2">
        <ConfirmacionEnLinea
          trato="destructivo"
          pregunta="¿Desconectar LinkedIn? Tus videos dejarán de salir solos ahí y te quedarán para subir a mano."
          confirmar="Desconectar"
          volver="Volver"
          cargando={pendiente}
          alVolver={() => setPreguntando(false)}
          alConfirmar={() =>
            empezar(async () => {
              const resultado = await desconectar()
              if (!resultado.ok) {
                setError(resultado.error)
                return
              }
              setPreguntando(false)
              alDesconectar()
            })
          }
        />
        {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      </div>
    )
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {enlace}
      <Boton variante="linea" tamano="chico" onClick={() => setPreguntando(true)}>
        Desconectar
      </Boton>
    </div>
  )
}

function FormularioDeLlave({
  fila,
  guardarLlave,
  alGuardar,
  alCancelar,
}: {
  fila: FilaDeCuenta
  guardarLlave: PropiedadesDeCuentas["guardarLlave"]
  alGuardar: (estado: EstadoDeLlave) => void
  alCancelar: () => void
}) {
  const [llave, setLlave] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const id = `llave-${fila.cuenta}`

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const limpia = llave.trim()
    if (limpia === "") return
    setError(null)
    empezar(async () => {
      const resultado = await guardarLlave(fila.cuenta, limpia)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      alGuardar(resultado.estado)
    })
  }

  return (
    <form onSubmit={enviar} className="mt-2 grid gap-3">
      <label className="grid gap-2 text-meta font-semibold" htmlFor={id}>
        {`Llave de ${fila.nombre}`}
      </label>
      <input
        id={id}
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={llave}
        onChange={(evento) => setLlave(evento.target.value)}
        aria-describedby={`${id}-ayuda`}
        className="campo text-cuerpo text-tinta"
      />
      <p id={`${id}-ayuda`} className="text-meta text-apagado">
        Pégala completa. La reviso con {fila.nombre.split(" ")[0]} y queda guardada cifrada.
      </p>
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      <div className="grid grid-cols-2 gap-2">
        <Boton variante="linea" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={pendiente} deshabilitado={llave.trim() === ""}>
          Guardar y comprobar
        </Boton>
      </div>
    </form>
  )
}

/** The state of an account at the right of its name: text and icon in its ink, never a chip. */
function Estado({ fila }: { fila: FilaDeCuenta }) {
  const Icono = ICONO_POR_TONO[fila.tono]
  return (
    <span className={cn("inline-flex items-center gap-1 text-meta font-medium", TINTA[fila.tono])}>
      <Icono aria-hidden="true" size={ICONO.chico} />
      {fila.estado}
    </span>
  )
}
