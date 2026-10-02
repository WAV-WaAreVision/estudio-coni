"use client"

import { Share, SquarePlus } from "lucide-react"
import { useEffect, useState } from "react"
import { Nota } from "@/components/nota"
import { Boton } from "@/components/ui/boton"
import type { SuscripcionDelNavegador } from "@/lib/acciones/avisos"
import type { Resultado } from "@/lib/acciones/resultado"
import { type EstadoDeAvisos, estadoDeAvisos } from "@/lib/avisos/dispositivo"
import { type DatosDelDispositivo, type PuertoDeAvisos, puertoDelNavegador } from "@/lib/avisos/navegador"

export interface AccionesDeAvisos {
  guardar: (suscripcion: SuscripcionDelNavegador) => Promise<Resultado>
  quitar: (endpoint: string) => Promise<Resultado>
  probar: () => Promise<Resultado<{ enviados: number }>>
}

interface Propiedades {
  /** The VAPID public key, read by the server at request time; null while the server has no keys. */
  claveVapid: string | null
  acciones: AccionesDeAvisos
  /** The browser APIs; tests pass a fake. */
  puerto?: PuertoDeAvisos
}

const SIN_DATOS: DatosDelDispositivo = {
  ios: false,
  instalada: false,
  soportado: false,
  permiso: null,
  suscrito: false,
}

/** "Avisos en tu celular": installs the app (iPhone), asks for the permission after her tap and saves the device. */
export function AvisosDelCelular({ claveVapid, acciones, puerto }: Propiedades) {
  const [navegador] = useState(() => puerto ?? puertoDelNavegador())
  const [dispositivo, setDispositivo] = useState<DatosDelDispositivo | null>(null)
  const [ocupada, setOcupada] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prueba, setPrueba] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    navegador
      .leer()
      .then((datos) => {
        if (vigente) setDispositivo(datos)
      })
      .catch((causa: unknown) => {
        console.error("No pude leer el estado de los avisos", causa)
        if (vigente) setDispositivo(SIN_DATOS)
      })
    return () => {
      vigente = false
    }
  }, [navegador])

  if (!dispositivo) {
    return <output className="esqueleto h-5 w-2/3" aria-label="Revisando los avisos" />
  }

  const estado = estadoDeAvisos({ ...dispositivo, configurado: claveVapid !== null })

  async function activar() {
    if (!claveVapid) return
    setOcupada(true)
    setError(null)
    setPrueba(null)
    try {
      const resultado = await navegador.activar(claveVapid)
      if (resultado.estado === "denegada") {
        setDispositivo((antes) => (antes ? { ...antes, permiso: "denied" } : antes))
        return
      }
      const guardada = await acciones.guardar(resultado.suscripcion)
      if (!guardada.ok) {
        // A subscription the server does not know would look like "on" after a reload and never receive anything.
        await navegador.desactivar()
        setError(guardada.error)
        return
      }
      setDispositivo((antes) => (antes ? { ...antes, permiso: "granted", suscrito: true } : antes))
    } catch (causa) {
      console.error("No pude activar los avisos", causa)
      setError("No pude activar los avisos en este celular. Inténtalo de nuevo.")
    } finally {
      setOcupada(false)
    }
  }

  async function desactivar() {
    setOcupada(true)
    setError(null)
    setPrueba(null)
    try {
      const endpoint = await navegador.desactivar()
      if (endpoint) {
        const quitada = await acciones.quitar(endpoint)
        if (!quitada.ok) {
          setError(quitada.error)
          return
        }
      }
      setDispositivo((antes) => (antes ? { ...antes, suscrito: false } : antes))
    } catch (causa) {
      console.error("No pude desactivar los avisos", causa)
      setError("No pude desactivar los avisos. Inténtalo de nuevo.")
    } finally {
      setOcupada(false)
    }
  }

  async function probar() {
    setOcupada(true)
    setError(null)
    setPrueba(null)
    try {
      const resultado = await acciones.probar()
      if (resultado.ok) setPrueba("Listo, te lo mandé. Debería llegarte en unos segundos.")
      else setError(resultado.error)
    } finally {
      setOcupada(false)
    }
  }

  return (
    <div className="grid gap-3">
      <Contenido estado={estado} />
      {estado === "listo" ? (
        <Boton cargando={ocupada} onClick={activar}>
          Activar avisos
        </Boton>
      ) : null}
      {estado === "activo" ? (
        <div className="grid gap-1.5">
          <Boton variante="linea" cargando={ocupada} onClick={probar}>
            Enviar uno de prueba
          </Boton>
          <Boton variante="callado" tamano="chico" cargando={ocupada} onClick={desactivar}>
            Desactivar avisos
          </Boton>
        </div>
      ) : null}
      {prueba ? <Nota tipo="ok" titulo={prueba} /> : null}
      {error ? <Nota tipo="error" titulo={error} /> : null}
    </div>
  )
}

function Contenido({ estado }: { estado: EstadoDeAvisos }) {
  switch (estado) {
    case "instalar":
      return <HojaDeInstalacion />
    case "listo":
      return (
        <p>
          Te aviso aquí cuando tengas un guion o un video para revisar. El aviso solo te lleva a la pantalla: aprobar lo
          haces tú, mirándolo.
        </p>
      )
    case "activo":
      return <Nota tipo="ok" titulo="Avisos activados en este celular" />
    case "denegado":
      return (
        <Nota tipo="aviso" titulo="Los avisos están bloqueados">
          <p>
            Para volver a activarlos, abre Ajustes del iPhone, entra a Notificaciones, busca Conidolly y activa Permitir
            notificaciones. Después vuelve aquí.
          </p>
        </Nota>
      )
    case "no_disponible":
      return (
        <Nota tipo="ocupada" titulo="Este celular no puede recibir avisos">
          <p>
            En iPhone hace falta iOS 16.4 o más nuevo. Mientras tanto te los mando por correo, y también cuando algo
            falla.
          </p>
        </Nota>
      )
  }
}

/** The illustrated sheet of design Pass 3, step 2: Safari's own words, in Safari's own order. */
function HojaDeInstalacion() {
  return (
    <section
      aria-labelledby="instalar-titulo"
      className="grid gap-3 rounded-lg border border-linea bg-superficie p-4.5"
    >
      <h3 id="instalar-titulo" className="text-[1.25rem] font-semibold">
        Agrégala a tu pantalla de inicio
      </h3>
      <p>Para recibir avisos en el iPhone, primero instala la app. Toma un minuto y necesitas iOS 16.4 o más nuevo.</p>
      <ol className="grid gap-3">
        <li className="flex items-start gap-3">
          <Share aria-hidden="true" className="mt-0.5 shrink-0 text-acento" size={24} />
          <span>
            Toca <strong>Compartir</strong>, el cuadrado con la flecha hacia arriba, abajo en Safari.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <SquarePlus aria-hidden="true" className="mt-0.5 shrink-0 text-acento" size={24} />
          <span>
            Elige <strong>Agregar a inicio</strong> y toca Agregar.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-acento text-label font-semibold text-sobre-acento"
          >
            C
          </span>
          <span>Abre Conidolly desde tu pantalla de inicio y vuelve a Ajustes para activar los avisos.</span>
        </li>
      </ol>
    </section>
  )
}
