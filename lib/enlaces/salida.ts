import { diaLocal } from "@/lib/dominio/fechas"
import type { Enlace } from "./config"
import { esVisitaHumana } from "./robots"
import { huellaDeVisitante, ipDeLaSolicitud } from "./visitante"

export interface DepsSalida {
  leerEnlaces: () => Promise<Enlace[]>
  /** True when this visitor had not clicked that link today. */
  registrarClic: (enlace: string, huella: string, dia: string) => Promise<boolean>
  ahora: () => number
  zona: string
  secreto: string
  /** Where a failure is reported. A visitor is never kept from the link by a broken counter. */
  avisarFalla?: (contexto: string, error: unknown) => void
}

export interface Salida {
  /** An absolute address, or `/l` when there is nothing to send her to. */
  destino: string
  contado: boolean
}

const VOLVER = "/l"

function registrarEnConsola(contexto: string, error: unknown): void {
  console.error(contexto, error)
}

/**
 * What `/l/ir/<id>` does: finds the link, counts one click for a person (a daily hash of address and device, see
 * visitante.ts) and says where to go. Counting never decides the destination: if the counter fails, she still gets
 * to the link, and the failure is reported.
 */
export async function resolverSalida(entrada: {
  enlace: string
  cabeceras: Headers
  deps: DepsSalida
  /** False for a `HEAD`, which only asks where the link goes and is nobody tapping. */
  contar?: boolean
}): Promise<Salida> {
  const { enlace, cabeceras, deps, contar = true } = entrada
  const avisar = deps.avisarFalla ?? registrarEnConsola

  let enlaces: Enlace[]
  try {
    enlaces = await deps.leerEnlaces()
  } catch (error) {
    avisar("No pude leer los enlaces de /l", error)
    return { destino: VOLVER, contado: false }
  }
  const elegido = enlaces.find((candidato) => candidato.id === enlace)
  if (!elegido) return { destino: VOLVER, contado: false }
  if (!contar || !esVisitaHumana(cabeceras)) return { destino: elegido.url, contado: false }

  try {
    const ahora = deps.ahora()
    const dia = diaLocal(ahora, deps.zona)
    const huella = huellaDeVisitante({
      secreto: deps.secreto,
      dia,
      ip: ipDeLaSolicitud(cabeceras),
      agente: cabeceras.get("user-agent") ?? "",
    })
    return { destino: elegido.url, contado: await deps.registrarClic(elegido.id, huella, dia) }
  } catch (error) {
    avisar(`No pude contar el clic de ${elegido.id}`, error)
    return { destino: elegido.url, contado: false }
  }
}
