import { etiquetaDeFecha } from "@/lib/dominio/fechas"

export type NombreDeCuenta = "instagram" | "heygen" | "elevenlabs" | "anthropic"

/** What the checks found out about one account. */
export type EstadoDeCuenta =
  | { cuenta: NombreDeCuenta; estado: "lista" }
  | { cuenta: NombreDeCuenta; estado: "falta" }
  | { cuenta: NombreDeCuenta; estado: "vence"; expiraEn: number }
  | { cuenta: NombreDeCuenta; estado: "vencida" }
  | { cuenta: NombreDeCuenta; estado: "rechazada"; motivo: string }
  | { cuenta: NombreDeCuenta; estado: "sin_respuesta" }

export const NOMBRE_DE_CUENTA: Record<NombreDeCuenta, string> = {
  instagram: "Instagram",
  heygen: "HeyGen",
  elevenlabs: "ElevenLabs",
  anthropic: "Claude",
}

const PASO_DE_CUENTA: Record<NombreDeCuenta, string> = {
  instagram: "Instagram conectado",
  heygen: "HeyGen con tu avatar",
  elevenlabs: "ElevenLabs con tu voz",
  anthropic: "Claude (Anthropic)",
}

const ORDEN: readonly NombreDeCuenta[] = ["instagram", "heygen", "elevenlabs", "anthropic"]
const DIA_MS = 24 * 60 * 60 * 1000
export const DIAS_DE_AVISO_DE_INSTAGRAM = 7

export interface BloqueDeEstado {
  /** The three states of the block (docs/DESIGN.md, status-block), plus the one that admits the check did not run. */
  tipo: "configurando" | "todo_bien" | "atencion" | "sin_revision"
  titulo: string
  texto?: string
  pasos: { etiqueta: string; listo: boolean }[]
  accion?: { etiqueta: string; href: string }
}

const CONECTAR = "/api/meta/conectar"

/** How many days are left, as Coni reads it: "mañana" under a day, never "1 días". */
function plazo(expiraEn: number, ahora: number): string {
  const dias = Math.ceil((expiraEn - ahora) / DIA_MS)
  return dias <= 1 ? "mañana" : `en ${dias} días`
}

function accionDeFalta(cuenta: NombreDeCuenta): NonNullable<BloqueDeEstado["accion"]> {
  return cuenta === "instagram"
    ? { etiqueta: "Conectar Instagram", href: CONECTAR }
    : { etiqueta: `Agregar la llave de ${NOMBRE_DE_CUENTA[cuenta]}`, href: `#cuenta-${cuenta}` }
}

function bloqueDeAtencion(cuenta: EstadoDeCuenta, ahora: number): Omit<BloqueDeEstado, "pasos"> {
  const nombre = NOMBRE_DE_CUENTA[cuenta.cuenta]
  switch (cuenta.estado) {
    case "vence":
      return {
        tipo: "atencion",
        titulo: `Instagram vence ${plazo(cuenta.expiraEn, ahora)}`,
        texto: "Renueva la conexión para que los reels sigan saliendo.",
        accion: { etiqueta: "Renovar Instagram", href: CONECTAR },
      }
    case "vencida":
      return {
        tipo: "atencion",
        titulo: "Instagram dejó de estar conectado",
        texto: "Conéctalo de nuevo para que los reels sigan saliendo.",
        accion: { etiqueta: "Renovar Instagram", href: CONECTAR },
      }
    default:
      return {
        tipo: "atencion",
        titulo: `${nombre} no aceptó la llave`,
        texto: "Pega una llave nueva para que sigan los guiones y los videos.",
        accion: { etiqueta: `Cambiar la llave de ${nombre}`, href: `#cuenta-${cuenta.cuenta}` },
      }
  }
}

/** The block at the top of Ajustes, from what the live checks found. Pure: the checks and the clock come in. */
export function estadoDeAjustes(entrada: {
  cuentas: readonly EstadoDeCuenta[]
  ahora: number
  zona: string
}): BloqueDeEstado {
  const { cuentas, ahora, zona } = entrada
  const ordenadas = ORDEN.flatMap((nombre) => cuentas.find((c) => c.cuenta === nombre) ?? [])
  const faltan = ordenadas.filter((c) => c.estado === "falta")
  const pasos = ORDEN.map((nombre) => ({
    etiqueta: PASO_DE_CUENTA[nombre],
    listo: ordenadas.find((c) => c.cuenta === nombre)?.estado !== "falta",
  }))

  const primeraQueFalta = faltan[0]
  if (primeraQueFalta) {
    return {
      tipo: "configurando",
      titulo: `Configuración: ${pasos.filter((p) => p.listo).length} de ${pasos.length} listos`,
      texto: "Falta lo que sigue; el resto ya está.",
      pasos,
      accion: accionDeFalta(primeraQueFalta.cuenta),
    }
  }

  const conProblema = ordenadas.find((c) => c.estado === "vence" || c.estado === "vencida" || c.estado === "rechazada")
  if (conProblema) return { ...bloqueDeAtencion(conProblema, ahora), pasos }

  if (ordenadas.some((c) => c.estado === "sin_respuesta")) {
    return {
      tipo: "sin_revision",
      titulo: "No pude revisar las cuentas ahora",
      texto: "Lo intento de nuevo cuando abras Ajustes.",
      pasos,
    }
  }

  const hora = etiquetaDeFecha(new Date(ahora).toISOString(), zona, "corta").split(" · ")[1] ?? ""
  return {
    tipo: "todo_bien",
    titulo: "Todo conectado",
    texto: `Instagram, HeyGen, ElevenLabs y Claude respondieron hoy a las ${hora}.`,
    pasos,
  }
}
