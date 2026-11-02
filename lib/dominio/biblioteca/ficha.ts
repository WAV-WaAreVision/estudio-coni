import { z } from "zod"

// The shape of the card that `procesar-material` writes into `fichas` (lib/ingesta/partes.ts and procesar.ts).
// Ported from Ingesta's lib/ingesta/ficha.ts; the columns come in as `unknown`, so this module needs no database types.

export const ERROR_SOLICITUD = "No entendí esa solicitud. Vuelve a abrir la pantalla."

export const Ubicacion = z.union([
  z.object({ pagina: z.number().nullable() }).strict(),
  z.object({ segundo: z.number(), pista: z.enum(["voz", "pantalla"]) }).strict(),
  z.object({ imagen: z.number() }).strict(),
])
export type Ubicacion = z.infer<typeof Ubicacion>

export interface FichaLeida {
  resumen: string
  ideasClave: string[]
  citas: { texto: string; ubicacion: Ubicacion }[]
  fuente: { autor: string | null; anio: number | null; enlace: string | null }
}

const Columnas = z.object({
  resumen: z.string(),
  ideas_clave: z.array(z.string()),
  citas: z.array(z.object({ texto: z.string(), ubicacion: Ubicacion })),
  fuente: z.object({ autor: z.string().nullable(), anio: z.number().nullable(), enlace: z.string().nullable() }),
})

/** The card from its json columns, null when they do not have the shape the task writes. */
export function leerFicha(fila: {
  resumen: string
  ideas_clave: unknown
  citas: unknown
  fuente: unknown
}): FichaLeida | null {
  const leida = Columnas.safeParse(fila)
  if (!leida.success) return null
  const { resumen, ideas_clave, citas, fuente } = leida.data
  return { resumen, ideasClave: ideas_clave, citas, fuente }
}

/** Where a quote lives in its source, as Coni reads it: "página 12", "1:15" or "imagen 3"; null when it has none. */
export function textoDeUbicacion(ubicacion: Ubicacion): string | null {
  if ("segundo" in ubicacion) {
    const total = Math.floor(ubicacion.segundo)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
  }
  if ("imagen" in ubicacion) return `imagen ${ubicacion.imagen}`
  return ubicacion.pagina === null ? null : `página ${ubicacion.pagina}`
}

/** Each name goes after "del": the languages Coni's references come in. */
const IDIOMAS: Record<string, string> = {
  en: "inglés",
  pt: "portugués",
  fr: "francés",
  de: "alemán",
  it: "italiano",
  ca: "catalán",
  nl: "neerlandés",
  ru: "ruso",
  ja: "japonés",
  zh: "chino",
  ko: "coreano",
  ar: "árabe",
}

/** How the card was made: translated and adapted to Coni's voice, or only adapted when the original is Spanish. */
export function adaptacionDe(idiomaOriginal: string | null): string {
  if (idiomaOriginal === null || idiomaOriginal === "es") return "Adaptado a la voz de Coni"
  const idioma = IDIOMAS[idiomaOriginal]
  return `Traducido ${idioma ? `del ${idioma}` : "de otro idioma"} y adaptado a la voz de Coni`
}

export const MINIMO_DE_IDEAS = 5
export const MAXIMO_DE_IDEAS = 10

/** The longest text each field of the card takes: the form uses them as `maxLength`, the action refuses anything longer. */
export const LARGO_DE_RESUMEN = 5000
export const LARGO_DE_IDEA = 500
export const LARGO_DE_CITA = 2000
export const LARGO_DE_AUTOR = 2000
export const LARGO_DE_ENLACE = 2000
export const ANIO_MINIMO = 0
export const ANIO_MAXIMO = 3000

const texto = (maximo: number) => z.string().trim().max(maximo)
const textoONulo = (maximo: number) =>
  z
    .string()
    .max(maximo)
    .nullable()
    .transform((valor) => valor?.trim() || null)

export const EsquemaDeEdicionDeFicha = z.object({
  materialId: z.uuid(),
  resumen: texto(LARGO_DE_RESUMEN),
  ideasClave: z.array(texto(LARGO_DE_IDEA)).max(MAXIMO_DE_IDEAS + 10),
  citas: z.array(z.object({ texto: texto(LARGO_DE_CITA), ubicacion: Ubicacion })).max(20),
  fuente: z.object({
    autor: textoONulo(LARGO_DE_AUTOR),
    anio: z.number().int().min(ANIO_MINIMO).max(ANIO_MAXIMO).nullable(),
    enlace: textoONulo(LARGO_DE_ENLACE),
  }),
})

export type EdicionDeFicha = z.output<typeof EsquemaDeEdicionDeFicha>
export type EdicionLeida = { ok: true; datos: EdicionDeFicha } | { ok: false; error: string }

/**
 * The card's source link is text the model or Coni wrote: only an absolute http(s) address is saved or becomes a link, so a
 * `javascript:`, `data:` or relative value can never run or navigate inside the app.
 */
export function esEnlaceWeb(enlace: string): boolean {
  if (!URL.canParse(enlace)) return false
  const { protocol } = new URL(enlace)
  return protocol === "http:" || protocol === "https:"
}

const MUY_LARGO: Record<string, string> = {
  resumen: "El resumen es muy largo.",
  ideasClave: "Una idea clave es muy larga.",
  citas: "Una cita es muy larga.",
  autor: "El autor de la fuente es muy largo.",
  enlace: "El enlace de la fuente es muy largo.",
}

/** The first problem the form can cause, in her words; anything else means the screen is out of date. */
function errorDeEdicion(problemas: z.core.$ZodIssue[]): string {
  for (const { path, code } of problemas) {
    const [campo, segundo] = path
    if (campo === "fuente" && segundo === "anio") {
      return code === "too_big" || code === "too_small"
        ? `El año va entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`
        : "Escribe el año como un número entero, por ejemplo 2024."
    }
    if (code !== "too_big") continue
    // A list with too many entries has the problem on the list itself; a long entry has it one level down.
    if (campo === "ideasClave" && path.length === 1)
      return `Deja entre ${MINIMO_DE_IDEAS} y ${MAXIMO_DE_IDEAS} ideas clave.`
    const nombre = campo === "fuente" ? segundo : campo
    if (typeof nombre === "string" && nombre in MUY_LARGO && !(campo === "citas" && path.length === 1)) {
      return MUY_LARGO[nombre] ?? ERROR_SOLICITUD
    }
  }
  return ERROR_SOLICITUD
}

/** Validates an edit of a card; blank ideas and quotes are dropped before counting. The error is for her. */
export function leerEdicion(entrada: unknown): EdicionLeida {
  const leida = EsquemaDeEdicionDeFicha.safeParse(entrada)
  if (!leida.success) return { ok: false, error: errorDeEdicion(leida.error.issues) }
  const datos = {
    ...leida.data,
    ideasClave: leida.data.ideasClave.filter((idea) => idea !== ""),
    citas: leida.data.citas.filter((cita) => cita.texto !== ""),
  }
  if (datos.resumen === "") return { ok: false, error: "El resumen no puede quedar vacío." }
  if (datos.ideasClave.length < MINIMO_DE_IDEAS || datos.ideasClave.length > MAXIMO_DE_IDEAS) {
    return { ok: false, error: `Deja entre ${MINIMO_DE_IDEAS} y ${MAXIMO_DE_IDEAS} ideas clave.` }
  }
  if (datos.fuente.enlace !== null && !esEnlaceWeb(datos.fuente.enlace)) {
    return { ok: false, error: "El enlace de la fuente no es válido." }
  }
  return { ok: true, datos }
}
