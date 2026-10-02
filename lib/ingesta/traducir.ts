import type Anthropic from "@anthropic-ai/sdk"
import { confirmarGasto, liberarGasto, reservarGastoGeneral } from "@/lib/datos/repositorio"
import { Falla } from "@/lib/dominio/falla"
import type { Parte } from "@/lib/ingesta/partes"
import {
  adaptarAVozDeConi,
  CARACTERES_POR_LOTE,
  costoClaude,
  identificarIdioma,
  type UsoClaude,
} from "@/lib/proveedores/anthropic"

type Reserva = { tope: true } | { tope: false }

/** The monthly-cap ledger, injected so the step does not depend on the database (see `gastoEnBase`). */
export interface GastoDeTraduccion {
  reservar(reserva: { paso: "traduccion"; estimadoUsd: number; clave: string }): Promise<Reserva>
  confirmar(clave: string, realUsd: number): Promise<void>
  liberar(clave: string): Promise<void>
}

// Distinctive function words per language. Words shared by several of them (de, que, no, a) are left out on purpose.
const PALABRAS_VACIAS: Record<string, readonly string[]> = {
  es: "el la los las una unos unas es son por con para se su sus lo como más pero muy sin sobre también hasta hay donde cuando porque esta este esto eso ese entre cada del al y en que de un".split(
    " ",
  ),
  en: "the and of to is are was were it that this with for you your they their have has be not but what when from or an at by we he she his her its i in on".split(
    " ",
  ),
  pt: "o os as uma um uns não são por com para se seu sua seus suas mais mas muito sem sobre também até há onde quando porque está este isto isso esse entre cada do da dos das ao em você".split(
    " ",
  ),
  fr: "le la les une des est sont pour avec pas son sa ses mais très sans sur aussi jusqu où quand parce cette ce cet entre chaque du au et en que de un vous nous ils elle je tu".split(
    " ",
  ),
  it: "il lo gli le una uno è sono per con non suo sua suoi sue ma molto senza sopra anche fino dove quando perché questa questo quello tra ogni del al e in che di un voi noi loro lei io tu".split(
    " ",
  ),
}

/** Fewer words than this and the ratios say nothing. */
const MINIMO_DE_PALABRAS = 8
/** Share of the words that must be function words of the winning language. */
const MINIMO_DE_COBERTURA = 0.2
/** The winner must beat the runner-up by this factor (Spanish, Portuguese and Italian overlap a lot). */
const VENTAJA_MINIMA = 1.4
/** Sample sent to Claude when the heuristic cannot decide. */
const CARACTERES_DE_MUESTRA = 1500
/** Reserve for the language check, in case the heuristic is inconclusive. */
const ESTIMADO_IDIOMA_USD = 0.02

function palabrasDe(texto: string): string[] {
  return texto.toLowerCase().match(/\p{L}+/gu) ?? []
}

/** The language when the stopword ratio is clear, null when it is not. */
export function idiomaPorHeuristica(partes: readonly Parte[]): string | null {
  const palabras = palabrasDe(partes.map((p) => p.texto).join(" "))
  if (palabras.length < MINIMO_DE_PALABRAS) return null
  const puntajes = Object.entries(PALABRAS_VACIAS)
    .map(([idioma, lista]) => {
      const conjunto = new Set(lista)
      return { idioma, cobertura: palabras.filter((p) => conjunto.has(p)).length / palabras.length }
    })
    .sort((a, b) => b.cobertura - a.cobertura)
  const [primero, segundo] = puntajes
  if (!primero || primero.cobertura < MINIMO_DE_COBERTURA) return null
  if (segundo && primero.cobertura < segundo.cobertura * VENTAJA_MINIMA) return null
  return primero.idioma
}

/** The reported language wins; then the heuristic; Claude only decides what both leave open. */
export async function detectarIdioma(
  partes: readonly Parte[],
  idiomaReportado: string | undefined,
  cliente: Anthropic,
): Promise<{ idioma: string; uso: UsoClaude | null }> {
  const conocido = idiomaReportado ?? idiomaPorHeuristica(partes)
  if (conocido) return { idioma: conocido, uso: null }
  const muestra = partes
    .map((p) => p.texto)
    .join("\n")
    .slice(0, CARACTERES_DE_MUESTRA)
  return identificarIdioma({ cliente, muestra })
}

const MARCADORES_QUE_PIDEN_ADAPTAR: readonly RegExp[] = [
  // vosotros and its forms, and voseo
  /(?<!\p{L})(vosotros|vosotras|vuestr[oa]s?|os|vos|tenés|sabés|querés|podés)(?!\p{L})/iu,
  /(?<!\p{L})\p{L}+(áis|éis|ís)(?!\p{L})/iu,
  // Spain
  /(?<!\p{L})(vale|ordenador(es)?|móvil(es)?|zumo|coger|cojo|coche|aparcar|guay|tío|tía|chaval(a)?|currar|mola|molar|fenomenal)(?!\p{L})/iu,
  // Mexico
  /(?<!\p{L})(ahorita|chamba|güey|platicar|platicamos|ándale|órale|chido|padrísimo)(?!\p{L})/iu,
  // formal address
  /(?<!\p{L})usted(?!\p{L})/iu,
  // self-help jargon of docs/voz/voz-de-coni.md
  /autoestima|empodera|mejor versión|establec\p{L}* límites|sé positiv|eres suficiente|deberías|tienes que|no te preocupes|tranquila|es normal|trabaja (en ti|tu)|vibra|frecuencia|manifest|universo|sanar|atrae|diagnóstico/iu,
]

/** True unless a cheap check says the text is already Chilean Spanish with nothing to adapt. Only meaningful for Spanish. */
export function necesitaAdaptacion(texto: string): boolean {
  return MARCADORES_QUE_PIDEN_ADAPTAR.some((marcador) => marcador.test(texto))
}

const CARACTERES_POR_TOKEN = 3
// System prompt plus the instructions of each request, uncached (the first batch writes the cache).
const TOKENS_FIJOS_POR_LOTE = 3_000
// The answer echoes the locations and Spanish runs longer than most sources.
const FACTOR_DE_SALIDA = 1.6

/** Reservation for the call, from the characters to adapt. Over-estimates: the real cost is confirmed afterwards. */
export function estimarCostoDeTraduccion(caracteres: number, conDeteccion: boolean): number {
  const tokens = Math.ceil(caracteres / CARACTERES_POR_TOKEN)
  const lotes = Math.max(1, Math.ceil(caracteres / CARACTERES_POR_LOTE))
  const base = costoClaude({
    input_tokens: tokens + TOKENS_FIJOS_POR_LOTE * lotes,
    output_tokens: Math.ceil(tokens * FACTOR_DE_SALIDA),
  })
  return Number((base + (conDeteccion ? ESTIMADO_IDIOMA_USD : 0)).toFixed(4))
}

interface Trozo {
  texto: string
  /** What goes between the previous chunk and this one when the part is put back together. */
  antes: string
}

const NIVELES_DE_CORTE: readonly { separador: RegExp; union: string }[] = [
  { separador: /\n{2,}/, union: "\n\n" },
  { separador: /(?<=[.!?…])\s+/, union: " " },
]

/** Splits at paragraphs, then sentences, then a hard cut; chunks are packed as full as the limit allows. */
export function trocear(texto: string, limite = CARACTERES_POR_LOTE, nivel = 0): Trozo[] {
  if (texto.length <= limite) return [{ texto, antes: "" }]
  const corte = NIVELES_DE_CORTE[nivel]
  if (!corte) {
    const trozos: Trozo[] = []
    for (let desde = 0; desde < texto.length; desde += limite)
      trozos.push({ texto: texto.slice(desde, desde + limite), antes: "" })
    return trozos
  }
  const resultado: Trozo[] = []
  for (const unidad of texto.split(corte.separador)) {
    const piezas = trocear(unidad, limite, nivel + 1)
    const ultimo = resultado.at(-1)
    const [primera] = piezas
    if (
      ultimo &&
      piezas.length === 1 &&
      primera &&
      ultimo.texto.length + corte.union.length + primera.texto.length <= limite
    ) {
      ultimo.texto += corte.union + primera.texto
      continue
    }
    resultado.push(
      ...piezas.map((pieza, i) => (i === 0 && resultado.length > 0 ? { ...pieza, antes: corte.union } : pieza)),
    )
  }
  return resultado
}

function unirTrozos(trozos: readonly Trozo[], adaptados: readonly string[]): string {
  return trozos.map((trozo, i) => trozo.antes + (adaptados[i] ?? "")).join("")
}

/** Groups parts into requests of at most ~CARACTERES_POR_LOTE characters; each part is already within the limit. */
function lotesPorCaracteres<T extends { texto: string }>(elementos: readonly T[]): T[][] {
  const lotes: T[][] = []
  let actual: T[] = []
  let largo = 0
  for (const elemento of elementos) {
    if (actual.length > 0 && largo + elemento.texto.length > CARACTERES_POR_LOTE) {
      lotes.push(actual)
      actual = []
      largo = 0
    }
    actual.push(elemento)
    largo += elemento.texto.length
  }
  if (actual.length > 0) lotes.push(actual)
  return lotes
}

/** One paid request: reserve against the cap, run it, confirm its real cost; release only if it failed. */
async function pagando<T>(
  gasto: GastoDeTraduccion,
  clave: string,
  estimadoUsd: number,
  pedir: () => Promise<{ valor: T; uso: UsoClaude | null }>,
): Promise<{ valor: T; costoUsd: number }> {
  const reserva = await gasto.reservar({ paso: "traduccion", estimadoUsd, clave })
  if (reserva.tope) throw new Falla("Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir.")
  let respuesta: { valor: T; uso: UsoClaude | null }
  try {
    respuesta = await pedir()
  } catch (error) {
    await gasto.liberar(clave)
    throw error
  }
  const costoUsd = respuesta.uso ? Number(costoClaude(respuesta.uso).toFixed(4)) : 0
  await gasto.confirmar(clave, costoUsd)
  return { valor: respuesta.valor, costoUsd }
}

/**
 * Brings every part to Spanish of Chile in Coni's voice. Parts already in clean Chilean Spanish skip Claude, and so
 * does the spend. Each Claude request is reserved against the monthly cap, confirmed with its real cost and released
 * only if it fails, so batches that finished stay paid for. A part longer than a batch is split, adapted in chunks and
 * put back together as one part with its original location.
 */
export async function traducirMaterial(entrada: {
  cliente: Anthropic
  gasto: GastoDeTraduccion
  /** Prefix of the spend keys; a random suffix keeps a retry from reusing a released reservation. */
  clave: string
  partes: readonly Parte[]
  idiomaReportado?: string
}): Promise<{ partes: Parte[]; idioma_original: string; costoUsd: number }> {
  const { cliente, gasto, partes } = entrada
  const clave = `${entrada.clave}:${crypto.randomUUID()}`
  let costoUsd = 0

  let idioma = entrada.idiomaReportado ?? idiomaPorHeuristica(partes)
  if (idioma === null) {
    const detectado = await pagando(gasto, `${clave}:idioma`, ESTIMADO_IDIOMA_USD, async () => {
      const { idioma: elegido, uso } = await detectarIdioma(partes, undefined, cliente)
      return { valor: elegido, uso }
    })
    idioma = detectado.valor
    costoUsd += detectado.costoUsd
  }

  // The check only means something for Spanish; any other language adapts every part with text.
  const indices = partes.flatMap((p, i) =>
    p.texto.trim() !== "" && (idioma !== "es" || necesitaAdaptacion(p.texto)) ? [i] : [],
  )
  const trozos = indices.flatMap((indice) =>
    trocear(partes[indice]?.texto ?? "").map((trozo) => ({ indice, trozo, texto: trozo.texto })),
  )

  const adaptados = new Map<number, string[]>()
  const lotes = lotesPorCaracteres(trozos)
  for (const [n, lote] of lotes.entries()) {
    const caracteres = lote.reduce((total, t) => total + t.texto.length, 0)
    const enviadas = lote.map(
      (t): Parte => ({ texto: t.texto, ubicacion: partes[t.indice]?.ubicacion ?? { pagina: null } }),
    )
    const hecho = await pagando(gasto, `${clave}:lote${n}`, estimarCostoDeTraduccion(caracteres, false), async () => {
      const r = await adaptarAVozDeConi({ cliente, partes: enviadas })
      return { valor: r.partes, uso: r.uso }
    })
    costoUsd += hecho.costoUsd
    lote.forEach((t, i) => {
      const lista = adaptados.get(t.indice) ?? []
      lista.push(hecho.valor[i]?.texto ?? "")
      adaptados.set(t.indice, lista)
    })
  }

  const resultado = partes.map((parte, i): Parte => {
    const textos = adaptados.get(i)
    if (!textos) return parte
    const propios = trozos.filter((t) => t.indice === i).map((t) => t.trozo)
    return { texto: unirTrozos(propios, textos), ubicacion: parte.ubicacion }
  })
  return { partes: resultado, idioma_original: idioma, costoUsd: Number(costoUsd.toFixed(4)) }
}

/** The spend ledger on the real database: the same three RPCs the other paid steps use. */
export function gastoEnBase(db: Parameters<typeof reservarGastoGeneral>[0], ahora: () => string): GastoDeTraduccion {
  return {
    reservar: (r) => reservarGastoGeneral(db, { proveedor: "anthropic", ...r, ahora: ahora() }),
    confirmar: (clave, realUsd) => confirmarGasto(db, clave, realUsd),
    liberar: (clave) => liberarGasto(db, clave),
  }
}
