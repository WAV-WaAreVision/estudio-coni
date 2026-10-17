"use client"

import { ArrowRight, Warning } from "@phosphor-icons/react"
import { type FormEvent, useCallback, useRef, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import { PildoraDeEstado } from "@/components/ui/estado"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MasOpciones } from "@/components/ui/mas-opciones"
import type { EstadoDeLlave } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import type { FilaDeCuenta } from "@/lib/ajustes/presentar"

const MENSAJE_DE_LLAVE: Record<EstadoDeLlave, string> = {
  comprobada: "Guardada y comprobada.",
  sin_comprobar: "Guardada. No pude comprobarla ahora, la reviso más tarde.",
  sin_voz: "Guardada. Falta tu voz de ElevenLabs: avísale a Federico.",
}
const TEXTO_DESCONECTAR = "Tus videos dejarán de salir solos ahí y te quedarán para subir a mano."
const MENSAJE_DESCONECTADO =
  "LinkedIn quedó desconectado. Si quieres, también puedes quitar el permiso desde la configuración de tu cuenta de LinkedIn."

interface PropiedadesDeCuentas {
  filas: readonly FilaDeCuenta[]
  guardarLlave: (cuenta: string, llave: string) => Promise<Resultado<{ estado: EstadoDeLlave }>>
  desconectarLinkedin: () => Promise<Resultado>
}

/** Decision 12 (v6 screens 6 and 6b): each account with its state as a pill, what it does, and its actions. */
export function CuentasConectadas({ filas, guardarLlave, desconectarLinkedin }: PropiedadesDeCuentas) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  // Stable, so a re-render while the toast is up does not restart its 8 s.
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  return (
    <div className="grid">
      <Grupo plano lista>
        {filas.map((fila) => (
          <li key={fila.cuenta} id={`cuenta-${fila.cuenta}`} className="grid scroll-mt-4 gap-2.5 py-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-guion leading-tight font-semibold">{fila.nombre}</span>
              <PildoraDeEstado tipo={fila.tono}>{fila.estado}</PildoraDeEstado>
            </div>
            {fila.detalle ? <p className="text-meta text-apagado">{fila.detalle}</p> : null}
            {fila.cuenta === "linkedin" ? (
              <AccionesDeLinkedin
                fila={fila}
                desconectar={desconectarLinkedin}
                alDesconectar={() => setMensaje(MENSAJE_DESCONECTADO)}
              />
            ) : fila.cuenta === "instagram" ? (
              // A plain link: the route answers with a redirect to Instagram, which a client navigation cannot follow.
              <a
                href="/api/meta/conectar"
                className={clasesDeBoton({ variante: "secundario", tamano: "chico", className: "w-fit" })}
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
            ) : fila.estado === "Falta" ? (
              <Boton variante="callado" onClick={() => setAbierta(fila.cuenta)}>
                {`Agregar la llave de ${fila.nombre}`}
              </Boton>
            ) : (
              // WAV's operation, not Coni's (answered question 3): folded, open when the key was refused.
              <MasOpciones forma="linea" titulo="Más opciones" abiertaAlInicio={fila.tono === "error"}>
                <Boton variante="callado" onClick={() => setAbierta(fila.cuenta)}>
                  {`Cambiar la llave de ${fila.nombre}`}
                </Boton>
              </MasOpciones>
            )}
          </li>
        ))}
      </Grupo>
      {mensaje ? <Aviso mensaje={mensaje} alCerrar={cerrarMensaje} /> : null}
    </div>
  )
}

/** LinkedIn: renew (the primary when it needs her), and disconnect behind a danger disclosure. */
function AccionesDeLinkedin({
  fila,
  desconectar,
  alDesconectar,
}: {
  fila: FilaDeCuenta
  desconectar: () => Promise<Resultado>
  alDesconectar: () => void
}) {
  const peligro = useRef<HTMLDetailsElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  if (!fila.conectada)
    return (
      <a
        href="/api/linkedin/conectar"
        className={clasesDeBoton({ variante: "secundario", tamano: "chico", className: "w-fit" })}
      >
        Conectar LinkedIn
      </a>
    )

  const urgente = fila.tono === "aviso" || fila.tono === "error"
  function cerrar() {
    if (peligro.current) peligro.current.open = false
  }

  return (
    <>
      <a
        href="/api/linkedin/conectar"
        className={
          urgente
            ? clasesDeBoton({ variante: "primario" })
            : clasesDeBoton({ variante: "secundario", tamano: "chico", className: "w-fit" })
        }
      >
        Renovar LinkedIn
        {urgente ? <ArrowRight aria-hidden="true" size={ICONO.grande} /> : null}
      </a>
      <MasOpciones ref={peligro} forma="linea" titulo="Desconectar LinkedIn">
        <div data-contorno className="grid gap-2.5 rounded-bloque bg-piedra-honda p-[14px]">
          <p className="flex items-start gap-2.5 text-meta text-tinta">
            <Warning aria-hidden="true" size={ICONO.chico} className="mt-0.5 shrink-0" />
            {TEXTO_DESCONECTAR}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Boton
              variante="destructiva"
              tamano="chico"
              cargando={pendiente}
              onClick={() =>
                empezar(async () => {
                  const resultado = await desconectar()
                  if (!resultado.ok) {
                    setError(resultado.error)
                    return
                  }
                  cerrar()
                  alDesconectar()
                })
              }
            >
              Sí, desconectar
            </Boton>
            <Boton variante="secundario" tamano="chico" onClick={cerrar}>
              Cancelar
            </Boton>
          </div>
          {error ? <LineaDeError>{error}</LineaDeError> : null}
        </div>
      </MasOpciones>
    </>
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
    <form onSubmit={enviar} className="grid gap-3">
      <label className="mx-0.5 text-meta font-semibold" htmlFor={id}>
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
      <p id={`${id}-ayuda`} className="mx-0.5 text-meta text-apagado">
        Pégala completa. La reviso con {fila.nombre.split(" ")[0]} y queda guardada cifrada.
      </p>
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      <div className="grid grid-cols-2 gap-2">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={pendiente} deshabilitado={llave.trim() === ""}>
          Guardar y comprobar
        </Boton>
      </div>
    </form>
  )
}
