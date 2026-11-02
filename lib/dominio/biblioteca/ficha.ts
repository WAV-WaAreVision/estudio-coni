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

const texto = (maximo: number) => z.string().trim().max(maximo)
const textoONulo = z
  .string()
  .nullable()
  .transform((valor) => valor?.trim() || null)

export const EsquemaDeEdicionDeFicha = z.object({
  materialId: z.uuid(),
  resumen: texto(5000),
  ideasClave: z.array(texto(500)).max(MAXIMO_DE_IDEAS + 10),
  citas: z.array(z.object({ texto: texto(2000), ubicacion: Ubicacion })).max(20),
  fuente: z.object({ autor: textoONulo, anio: z.number().int().min(0).max(3000).nullable(), enlace: textoONulo }),
})

export type EdicionDeFicha = z.output<typeof EsquemaDeEdicionDeFicha>
export type EdicionLeida = { ok: true; datos: EdicionDeFicha } | { ok: false; error: string }

function esEnlaceWeb(enlace: string): boolean {
  if (!URL.canParse(enlace)) return false
  const { protocol } = new URL(enlace)
  return protocol === "http:" || protocol === "https:"
}

/** Validates an edit of a card; blank ideas and quotes are dropped before counting. The error is for her. */
export function leerEdicion(entrada: unknown): EdicionLeida {
  const leida = EsquemaDeEdicionDeFicha.safeParse(entrada)
  if (!leida.success) return { ok: false, error: ERROR_SOLICITUD }
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
