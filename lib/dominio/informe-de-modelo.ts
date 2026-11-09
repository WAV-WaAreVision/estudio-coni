import {
  type AfirmacionParaPrueba,
  type Calibracion,
  type FuenteDeMuestras,
  type ModeloDeHuellas,
  punto,
  type TemaParaPrueba,
  type Traslado,
  temaMasCercano,
  type Umbrales,
  umbralesDe,
} from "@/lib/dominio/parecido"

// `type`, not `interface`: the report is stored in a jsonb column, and only type aliases are assignable to `Json`.
export type InformeDePrueba = {
  modelo: ModeloDeHuellas
  modeloAnterior: ModeloDeHuellas
  umbrales: Traslado
  afirmaciones: number
  temas: number
  /** Names of active topics the switch could not give a centroid: it refuses while there is one. */
  temasSinCentroide: string[]
  fusiones: { a: string; b: string; parecido: number }[]
  nuevasAsignaciones: { total: number; muestra: { texto: string; tema: string }[] }
  cambiosDeCercano: { texto: string; de: string; a: string }[]
  costoUsd: number
}

export type EntradaDelInforme = {
  vigente: Calibracion
  modelo: ModeloDeHuellas
  traslado: Traslado
  afirmaciones: readonly AfirmacionParaPrueba[]
  temas: readonly TemaParaPrueba[]
  nuevos: ReadonlyMap<string, readonly number[]>
  /**
   * `temas_fusion_rechazada`. Only Coni's «no» keeps a pair out: Claude's is asked again once the model changes
   * (`temas_parecidos`), and the report is about the new model.
   */
  rechazadas: readonly { a: string; b: string; origen: "claude" | "coni" }[]
  /** Stored «uno es parte del otro» pairs: not offered as a merge. */
  subtemas: readonly { a: string; b: string }[]
  /** Topics waiting in a merge proposal: no pair that touches one is offered. */
  enPropuesta: readonly string[]
  costoUsd: number
}

const MUESTRA_DE_ASIGNACIONES = 5
const parDe = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`)

export const recortar = (texto: string, largo = 80): string =>
  texto.length <= largo ? texto : `${texto.slice(0, largo - 1).trimEnd()}…`

/** What would change with the new model, computed in memory: nothing here touches the base. */
export function armarInforme(e: EntradaDelInforme): InformeDePrueba {
  const activos = e.temas.filter((t) => !t.fusionadoEn)
  const nombre = new Map(e.temas.map((t) => [t.id, t.nombre]))
  const viejos = new Map(activos.map((t) => [t.id, t.viejo]))
  const nuevos = new Map(
    activos.flatMap((t) => {
      const c = e.nuevos.get(t.id)
      return c ? [[t.id, c] as const] : []
    }),
  )
  const umbrales: Umbrales = umbralesDe(e.traslado)
  const sinOfrecer = new Set([
    ...e.rechazadas.filter((r) => r.origen === "coni").map((r) => parDe(r.a, r.b)),
    ...e.subtemas.map((s) => parDe(s.a, s.b)),
  ])
  const esperando = new Set(e.enPropuesta)
  const conCentroide = [...nuevos].sort(([x], [y]) => (x < y ? -1 : 1))
  const fusiones = conCentroide
    .flatMap(([a, ca], i) =>
      conCentroide.slice(i + 1).flatMap(([b, cb]) => {
        const parecido = punto(ca, cb)
        return parecido >= umbrales.fusion && !sinOfrecer.has(parDe(a, b)) && !esperando.has(a) && !esperando.has(b)
          ? [{ a: nombre.get(a) ?? a, b: nombre.get(b) ?? b, parecido }]
          : []
      }),
    )
    .sort((x, y) => y.parecido - x.parecido)
  const vivas = [...e.afirmaciones].filter((a) => !a.excluida).sort((x, y) => (x.id < y.id ? -1 : 1))
  const nuevas = vivas.flatMap((a) => {
    if (a.temaId !== null) return []
    const cercano = temaMasCercano(a.nuevo, nuevos, umbrales.tema)
    return cercano ? [{ texto: recortar(a.texto), tema: nombre.get(cercano.temaId) ?? cercano.temaId }] : []
  })
  const cambiosDeCercano = vivas.flatMap((a) => {
    if (a.temaId === null) return []
    const antes = temaMasCercano(a.viejo, viejos, Number.NEGATIVE_INFINITY)
    const despues = temaMasCercano(a.nuevo, nuevos, Number.NEGATIVE_INFINITY)
    if (!antes || !despues || antes.temaId === despues.temaId) return []
    return [
      {
        texto: recortar(a.texto),
        de: nombre.get(antes.temaId) ?? antes.temaId,
        a: nombre.get(despues.temaId) ?? despues.temaId,
      },
    ]
  })
  return {
    modelo: e.modelo,
    modeloAnterior: e.vigente.modelo,
    umbrales: e.traslado,
    afirmaciones: vivas.length,
    temas: activos.length,
    temasSinCentroide: activos.filter((t) => !nuevos.has(t.id)).map((t) => t.nombre),
    fusiones,
    nuevasAsignaciones: { total: nuevas.length, muestra: nuevas.slice(0, MUESTRA_DE_ASIGNACIONES) },
    cambiosDeCercano,
    costoUsd: e.costoUsd,
  }
}

const decimal = (x: number, digitos = 2) => x.toFixed(digitos).replace(".", ",")
const NOMBRE_DEL_UMBRAL: Record<keyof Umbrales, string> = {
  tema: "Tema",
  grupo: "Grupo",
  fusion: "Fusión",
  puenteMin: "Puente mínimo",
  puenteMax: "Puente máximo",
}
const NOMBRE_DE_LA_FUENTE: Record<FuenteDeMuestras, string> = {
  afirmacion_afirmacion: "pares de afirmaciones",
  afirmacion_tema: "pares afirmación-tema",
  tema_tema: "pares de temas",
}

/** The report in words, for Federico to read in the conversation before he approves or discards it. */
export function textoDelInforme(i: InformeDePrueba): string {
  const lineas = [
    `Prueba de ${i.modelo} sobre ${i.afirmaciones} afirmaciones y ${i.temas} temas (hoy ${i.modeloAnterior}).`,
    "",
    "Umbrales (hoy → con el modelo nuevo):",
  ]
  for (const clave of Object.keys(NOMBRE_DEL_UMBRAL) as (keyof Umbrales)[]) {
    const u = i.umbrales[clave]
    lineas.push(
      `- ${NOMBRE_DEL_UMBRAL[clave]}: ${decimal(u.viejo)} → ${decimal(u.nuevo)} (${u.muestras} ${NOMBRE_DE_LA_FUENTE[u.fuente]})`,
    )
  }
  lineas.push("")
  if (i.fusiones.length === 0) lineas.push("Ningún par de temas se juntaría.")
  else {
    lineas.push("Fusiones posibles (Claude las confirma igual cada noche):")
    for (const f of i.fusiones) lineas.push(`- «${f.a}» y «${f.b}» se juntarían (${decimal(f.parecido)}).`)
  }
  lineas.push("")
  if (i.nuevasAsignaciones.total === 0) lineas.push("Ninguna afirmación sin tema encontraría uno.")
  else {
    lineas.push(`Afirmaciones sin tema que encontrarían uno: ${i.nuevasAsignaciones.total}. Por ejemplo:`)
    for (const m of i.nuevasAsignaciones.muestra) lineas.push(`- «${m.texto}» → ${m.tema}`)
  }
  lineas.push("")
  if (i.cambiosDeCercano.length === 0) lineas.push("Ninguna afirmación con tema cambia de tema más cercano.")
  else {
    lineas.push(
      `Afirmaciones con tema cuyo tema más cercano cambia: ${i.cambiosDeCercano.length} (siguen en su tema: el cambio no mueve asignaciones).`,
    )
    for (const c of i.cambiosDeCercano) lineas.push(`- «${c.texto}»: ${c.de} → ${c.a}`)
  }
  lineas.push("")
  lineas.push(
    i.temasSinCentroide.length === 0
      ? "Todos los temas tienen centroide con el modelo nuevo."
      : `Temas sin centroide con el modelo nuevo (el cambio se niega mientras existan): ${i.temasSinCentroide.join(", ")}.`,
  )
  lineas.push(`Costo de la prueba: US$ ${decimal(i.costoUsd, 4)}.`)
  return lineas.join("\n")
}
