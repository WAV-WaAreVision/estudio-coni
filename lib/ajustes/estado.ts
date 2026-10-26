import { etiquetaDeFecha } from "@/lib/dominio/fechas"

export type NombreDeCuenta = "instagram" | "heygen" | "elevenlabs" | "anthropic" | "linkedin"

/** What the checks found out about one account. */
export type EstadoDeCuenta =
  | { cuenta: NombreDeCuenta; estado: "lista"; nombre?: string | null }
  | { cuenta: NombreDeCuenta; estado: "falta" }
  | { cuenta: NombreDeCuenta; estado: "vence"; expiraEn: number; nombre?: string | null }
  | { cuenta: NombreDeCuenta; estado: "vencida" }
  | { cuenta: NombreDeCuenta; estado: "rechazada"; motivo: string }
  | { cuenta: NombreDeCuenta; estado: "sin_respuesta" }

export const NOMBRE_DE_CUENTA: Record<NombreDeCuenta, string> = {
  instagram: "Instagram",
  heygen: "HeyGen",
  elevenlabs: "ElevenLabs",
  anthropic: "Claude",
  linkedin: "LinkedIn",
}

/**
 * Her checklist names only what she acts on (her voice, her avatar, Instagram, LinkedIn, the notices), never a provider:
 * those live under Para WAV. LinkedIn is optional, a piece just goes by hand without it (design L4): listed, never
 * counted. Claude is WAV's alone and is no step of hers.
 */
const PASOS_DE_CONI: readonly { cuenta: Exclude<NombreDeCuenta, "anthropic">; etiqueta: string }[] = [
  { cuenta: "elevenlabs", etiqueta: "Tu voz" },
  { cuenta: "heygen", etiqueta: "Tu avatar" },
  { cuenta: "instagram", etiqueta: "Instagram" },
  { cuenta: "linkedin", etiqueta: "LinkedIn" },
]
/** What the action of a missing account says, in her words. */
const ACCION_DE_FALTA: Record<Exclude<NombreDeCuenta, "instagram" | "linkedin">, string> = {
  heygen: "Revisar tu avatar",
  elevenlabs: "Revisar tu voz",
  anthropic: "Ver en Para WAV",
}

/** The accounts the app cannot work without, in the order their missing step is offered. */
const ORDEN: readonly Exclude<NombreDeCuenta, "linkedin">[] = ["instagram", "heygen", "elevenlabs", "anthropic"]
const PASO_DE_AVISOS = "Avisos en tu celular"
const DIA_MS = 24 * 60 * 60 * 1000
export const DIAS_DE_AVISO_DE_INSTAGRAM = 7
export const DIAS_DE_AVISO_DE_LINKEDIN = 14

export interface PasoDeConfiguracion {
  etiqueta: string
  listo: boolean
  /** Listed, never counted, never "Falta" (LinkedIn). */
  opcional?: true
}

export interface BloqueDeEstado {
  /** The three states of the block (docs/DESIGN.md, status-block), plus the one that admits the check did not run. */
  tipo: "configurando" | "todo_bien" | "atencion" | "sin_revision"
  titulo: string
  texto?: string
  pasos: PasoDeConfiguracion[]
  accion?: { etiqueta: string; href: string }
}

const CONECTAR = "/api/meta/conectar"
const CONECTAR_LINKEDIN = "/api/linkedin/conectar"
/** Accounts and keys live on their own level of Ajustes. */
export const RUTA_DE_CUENTAS = "/ajustes/cuentas"

/** How many days are left, as Coni reads it: "mañana" under a day, never "1 días". */
function plazo(expiraEn: number, ahora: number): string {
  const dias = Math.ceil((expiraEn - ahora) / DIA_MS)
  return dias <= 1 ? "mañana" : `en ${dias} días`
}

/** Without a connection the reels do not stop: each one waits for her to upload it by hand. */
function textoSinInstagram(faltaMas: boolean): string {
  const base = "Instagram no está conectado. Mientras tanto, cada reel espera a que lo subas tú a mano."
  return faltaMas ? `${base} También falta lo que sigue.` : base
}

function accionDeFalta(cuenta: Exclude<NombreDeCuenta, "linkedin">): NonNullable<BloqueDeEstado["accion"]> {
  return cuenta === "instagram"
    ? { etiqueta: "Conectar Instagram", href: CONECTAR }
    : { etiqueta: ACCION_DE_FALTA[cuenta], href: `${RUTA_DE_CUENTAS}#cuenta-${cuenta}` }
}

function textoDeFalta(primera: Exclude<NombreDeCuenta, "linkedin">, faltanMas: boolean): string {
  if (primera === "instagram") return textoSinInstagram(faltanMas)
  if (primera === "anthropic") return "Falta una conexión que arregla WAV; lo tuyo ya está."
  return "Falta lo que sigue; el resto ya está."
}

function bloqueDeAtencion(cuenta: EstadoDeCuenta, ahora: number): Omit<BloqueDeEstado, "pasos"> {
  const nombre = NOMBRE_DE_CUENTA[cuenta.cuenta]
  if (cuenta.cuenta === "linkedin" && (cuenta.estado === "vence" || cuenta.estado === "vencida")) {
    return {
      tipo: "atencion",
      titulo:
        cuenta.estado === "vence"
          ? `LinkedIn vence ${cuenta.expiraEn - ahora <= DIA_MS ? "hoy" : plazo(cuenta.expiraEn, ahora)}`
          : "LinkedIn dejó de estar conectado",
      texto:
        "Renuévalo para que tus videos sigan saliendo solos en LinkedIn. Mientras tanto, te los dejo listos para subir a mano.",
      accion: { etiqueta: "Renovar LinkedIn", href: CONECTAR_LINKEDIN },
    }
  }
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
        accion: { etiqueta: `Cambiar la llave de ${nombre}`, href: `${RUTA_DE_CUENTAS}#cuenta-${cuenta.cuenta}` },
      }
  }
}

/** The block at the top of Ajustes, from what the live checks found. Pure: the checks and the clock come in. */
export function estadoDeAjustes(entrada: {
  cuentas: readonly EstadoDeCuenta[]
  /** Coni has a device that receives notices. A step of the list, never the reason for the block to say "setting up". */
  avisosActivos: boolean
  ahora: number
  zona: string
}): BloqueDeEstado {
  const { cuentas, avisosActivos, ahora, zona } = entrada
  const ordenadas = ORDEN.flatMap((nombre) => cuentas.find((c) => c.cuenta === nombre) ?? [])
  const faltan = ORDEN.filter((nombre) => cuentas.find((c) => c.cuenta === nombre)?.estado === "falta")
  const pasos: PasoDeConfiguracion[] = [
    ...PASOS_DE_CONI.map(({ cuenta, etiqueta }): PasoDeConfiguracion => {
      const estado = cuentas.find((c) => c.cuenta === cuenta)?.estado
      return cuenta === "linkedin"
        ? { etiqueta, listo: estado === "lista" || estado === "vence", opcional: true }
        : { etiqueta, listo: estado !== "falta" }
    }),
    // The email reaches her without it, so a missing device does not make the block "setting up" or take the action.
    { etiqueta: PASO_DE_AVISOS, listo: avisosActivos },
  ]

  const primeraQueFalta = faltan[0]
  if (primeraQueFalta) {
    const contados = pasos.filter((p) => !p.opcional)
    return {
      tipo: "configurando",
      // Claude is checked last, so it comes first only when her accounts are all there: a count would read "4 de 4".
      titulo:
        primeraQueFalta === "anthropic"
          ? "Falta una conexión de WAV"
          : `Configuración: ${contados.filter((p) => p.listo).length} de ${contados.length} listos`,
      texto: textoDeFalta(primeraQueFalta, faltan.length > 1),
      pasos,
      accion: accionDeFalta(primeraQueFalta),
    }
  }

  const conProblema = ordenadas.find((c) => c.estado === "vence" || c.estado === "vencida" || c.estado === "rechazada")
  if (conProblema) return { ...bloqueDeAtencion(conProblema, ahora), pasos }

  const linkedin = cuentas.find((c) => c.cuenta === "linkedin")
  if (linkedin && (linkedin.estado === "vence" || linkedin.estado === "vencida")) {
    return { ...bloqueDeAtencion(linkedin, ahora), pasos }
  }

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
