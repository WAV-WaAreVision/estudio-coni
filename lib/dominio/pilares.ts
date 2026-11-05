/** The networks a pillar belongs to (spec 2026-11-04, part 15a). Their order is the order of every list. */
export const REDES = ["linkedin", "instagram"] as const
export type Red = (typeof REDES)[number]

export const NOMBRE_DE_RED: Record<Red, string> = { linkedin: "LinkedIn", instagram: "Instagram" }

/** Where the pillars of 2026-10-17 are listed while they stay active without a network (until the apply step). */
export const ETIQUETA_SIN_RED = "Pilares anteriores"

export function esRed(valor: unknown): valor is Red {
  return REDES.some((red) => red === valor)
}

/** A topic's pillar rows: `alta` is the main pillar of its network; a layer has none. */
export const FUERZAS = ["alta", "media", "baja"] as const
export type Fuerza = (typeof FUERZAS)[number]

export function esFuerza(valor: unknown): valor is Fuerza {
  return FUERZAS.some((fuerza) => fuerza === valor)
}

/** A pillar as `categorias` stores it (`es_pilar`). Inactive ones stay for the ideas, materials and topics that use them. */
export interface DatosDePilar {
  id: string
  slug: string
  nombre: string
  nombreCorto: string
  /** The description the prompts read; null only for a retired pillar. */
  descripcion: string | null
  activa: boolean
  orden: number
  /** Null for the pillars of 2026-10-17 and the retired sexology ones. */
  red: Red | null
  /** A lens inside a network's pillars (the TDAH layer): never an idea's pillar, and it has no weight. */
  esCapa: boolean
}

export type CatalogoDePilares = readonly DatosDePilar[]

/** What a screen shows of a pillar: the slug stays for `data-pilar`, the names are for reading. */
export interface PilarVisible {
  slug: string
  nombre: string
  nombreCorto: string
}

/** A pillar an idea can take, with its network so the ideas screen groups it. */
export interface PilarDeEleccion extends PilarVisible {
  red: Red | null
}

/** A pillar or layer of a network as the Temas screens use it: the id filters the list, the slug goes to the RPC. */
export interface PilarDeRed {
  id: string
  slug: string
  nombreCorto: string
  red: Red
  esCapa: boolean
}

const rangoDeRed = (red: Red | null) => (red === null ? REDES.length : REDES.indexOf(red))

/** Networks in their order, the pillars without one last; inside each, by `orden`, then by slug. */
export function ordenarPilares<T extends Pick<DatosDePilar, "red" | "orden" | "slug">>(pilares: readonly T[]): T[] {
  return pilares.toSorted(
    (a, b) => rangoDeRed(a.red) - rangoDeRed(b.red) || a.orden - b.orden || a.slug.localeCompare(b.slug),
  )
}

export function soloActivos(catalogo: CatalogoDePilares): DatosDePilar[] {
  return ordenarPilares(catalogo.filter((pilar) => pilar.activa))
}

/** The active pillars an idea or a piece can take: a layer is never chosen (spec section 4). */
export function pilaresParaElegir(catalogo: CatalogoDePilares): DatosDePilar[] {
  return soloActivos(catalogo).filter((pilar) => !pilar.esCapa)
}

/** The active pillars and layers a topic can have: those of a network. */
export function pilaresDeRedes(catalogo: CatalogoDePilares): PilarDeRed[] {
  return soloActivos(catalogo).flatMap(({ id, slug, nombreCorto, red, esCapa }) =>
    red === null ? [] : [{ id, slug, nombreCorto, red, esCapa }],
  )
}

/** A network's row in Temas: its pillars in the order given (the catalog's), then its layers, which are not pillars. */
export function pilaresDeLaRed(pilares: readonly PilarDeRed[], red: Red): PilarDeRed[] {
  const deLaRed = pilares.filter((pilar) => pilar.red === red)
  return [...deLaRed.filter((pilar) => !pilar.esCapa), ...deLaRed.filter((pilar) => pilar.esCapa)]
}

export interface GrupoDePilares<T> {
  red: Red | null
  etiqueta: string
  pilares: T[]
}

/** One group per network that has pillars, in network order, the pillars without a network last; order kept. */
export function porRed<T extends { red: Red | null }>(pilares: readonly T[]): GrupoDePilares<T>[] {
  const redes: (Red | null)[] = [...REDES, null]
  return redes.flatMap((red) => {
    const delGrupo = pilares.filter((pilar) => pilar.red === red)
    if (delGrupo.length === 0) return []
    return [{ red, etiqueta: red === null ? ETIQUETA_SIN_RED : NOMBRE_DE_RED[red], pilares: delGrupo }]
  })
}

function buscar(catalogo: CatalogoDePilares, slug: string): DatosDePilar {
  const pilar = catalogo.find((candidato) => candidato.slug === slug)
  if (!pilar) throw new Error(`Pilar desconocido: ${slug}`)
  return pilar
}

/** Ideas point at pillar rows only (FK and trigger), so an unknown slug is a bug, not data to hide. */
export function pilarVisible(catalogo: CatalogoDePilares, slug: string): PilarVisible
export function pilarVisible(catalogo: CatalogoDePilares, slug: string | null | undefined): PilarVisible | null
export function pilarVisible(catalogo: CatalogoDePilares, slug: string | null | undefined): PilarVisible | null {
  if (slug == null) return null
  const { nombre, nombreCorto } = buscar(catalogo, slug)
  return { slug, nombre, nombreCorto }
}

export function nombreDePilar(catalogo: CatalogoDePilares, slug: string): string {
  return buscar(catalogo, slug).nombre
}

/** The slugs an idea can take, for `z.enum` and the tolerant enums of the prompts, which need at least one value. */
export function slugsActivos(catalogo: CatalogoDePilares): [string, ...string[]] {
  const [primero, ...resto] = pilaresParaElegir(catalogo).map((pilar) => pilar.slug)
  if (primero === undefined) throw new Error("No hay pilares activos.")
  return [primero, ...resto]
}

/** One row of `pilar_pesos`. `desde` is a date, YYYY-MM-DD. */
export interface PesoDePilar {
  pilarId: string
  desde: string
  peso: number
}

export interface PesosDeRed {
  pesos: { id: string; slug: string; nombreCorto: string; peso: number }[]
  total: number
  /** False when the network's weights on that date do not add up to 100: the 15c panel warns, nothing blocks. */
  sumaCien: boolean
}

/** Each pillar's weight on `fecha` (YYYY-MM-DD): its row with the latest `desde` on or before it. */
export function calcularPesosDeRed(
  catalogo: CatalogoDePilares,
  filas: readonly PesoDePilar[],
  red: Red,
  fecha: string,
): PesosDeRed {
  const pesos = pilaresParaElegir(catalogo)
    .filter((pilar) => pilar.red === red)
    .flatMap((pilar) => {
      const vigente = filas
        .filter((fila) => fila.pilarId === pilar.id && fila.desde <= fecha)
        .reduce<PesoDePilar | null>(
          (ultima, fila) => (ultima === null || fila.desde > ultima.desde ? fila : ultima),
          null,
        )
      return vigente ? [{ id: pilar.id, slug: pilar.slug, nombreCorto: pilar.nombreCorto, peso: vigente.peso }] : []
    })
  const total = Math.round(pesos.reduce((suma, pilar) => suma + pilar.peso, 0) * 100) / 100
  return { pesos, total, sumaCien: total === 100 }
}

/** One stage of a network's weights: the date it starts and the weights it gives. */
export interface EtapaDePesos extends PesosDeRed {
  desde: string
}

/**
 * A network's stages from `hoy` on (spec 15c, decision 8): `hoy`, then every later `desde` its active pillars have,
 * in order, each with the weights in force on its date. `aprobar_borrador_de_pilar` computes the same set.
 */
export function calcularEtapasDeRed(
  catalogo: CatalogoDePilares,
  filas: readonly PesoDePilar[],
  red: Red,
  hoy: string,
): EtapaDePesos[] {
  const ids = new Set(
    pilaresParaElegir(catalogo)
      .filter((pilar) => pilar.red === red)
      .map((pilar) => pilar.id),
  )
  const despues = new Set(filas.filter((fila) => ids.has(fila.pilarId) && fila.desde > hoy).map((fila) => fila.desde))
  return [hoy, ...[...despues].toSorted()].map((desde) => ({
    desde,
    ...calcularPesosDeRed(catalogo, filas, red, desde),
  }))
}

/** One row of `tema_pilares` as the domain reads it. */
export interface FilaDePilarDeTema {
  pilarId: string
  fuerza: Fuerza | null
}

export interface PilaresDeRed {
  principal: PilarVisible | null
  secundarios: PilarVisible[]
  capa: PilarVisible | null
}

export type PilaresDeTema = Record<Red, PilaresDeRed>

export function sinPilares(): PilaresDeTema {
  return {
    linkedin: { principal: null, secundarios: [], capa: null },
    instagram: { principal: null, secundarios: [], capa: null },
  }
}

const aVisible = ({ slug, nombre, nombreCorto }: DatosDePilar): PilarVisible => ({ slug, nombre, nombreCorto })

/** Per network, the main pillar, the secondaries (`media` before `baja`, then catalog order) and the layer. */
export function pilaresDeTema(catalogo: CatalogoDePilares, filas: readonly FilaDePilarDeTema[]): PilaresDeTema {
  const posicion = new Map(ordenarPilares(catalogo).map((pilar, i) => [pilar.id, i]))
  const rango = (fuerza: Fuerza | null) => (fuerza === null ? FUERZAS.length : FUERZAS.indexOf(fuerza))
  const conPilar = filas.map((fila) => {
    const pilar = catalogo.find((candidato) => candidato.id === fila.pilarId)
    // The composite FK only lets a pillar of a network in: anything else is a bug.
    if (!pilar || pilar.red === null) throw new Error(`Pilar de tema desconocido: ${fila.pilarId}`)
    return { fuerza: fila.fuerza, pilar, red: pilar.red }
  })
  const resultado = sinPilares()
  const ordenadas = conPilar.toSorted(
    (a, b) => rango(a.fuerza) - rango(b.fuerza) || (posicion.get(a.pilar.id) ?? 0) - (posicion.get(b.pilar.id) ?? 0),
  )
  for (const { fuerza, pilar, red } of ordenadas) {
    const deRed = resultado[red]
    if (pilar.esCapa) deRed.capa = aVisible(pilar)
    else if (fuerza === "alta") deRed.principal = aVisible(pilar)
    else deRed.secundarios.push(aVisible(pilar))
  }
  return resultado
}

/** The line of a network on a topic's page (spec section 5). "Principal" never shows: the main one is the pillar. */
export function lineaDePilares(red: Red, pilares: PilaresDeRed): string {
  const partes = [
    pilares.principal
      ? `${NOMBRE_DE_RED[red]}: ${pilares.principal.nombreCorto}`
      : `Sin pilar en ${NOMBRE_DE_RED[red]}`,
  ]
  if (pilares.capa) partes.push(pilares.capa.nombreCorto)
  if (pilares.secundarios.length > 0) {
    partes.push(`También toca: ${pilares.secundarios.map((pilar) => pilar.nombreCorto).join(", ")}`)
  }
  return partes.join(" · ")
}

/** What "Cambiar pilares" edits: slugs, "" for no pillar in a network. */
export interface EleccionDePilares {
  principal: Record<Red, string>
  secundarios: Record<Red, string[]>
  capas: string[]
}

/** A row as `cambiar_pilares_de_tema` and `pilares_automaticos_de_tema` take it. */
export interface FilaDePilarElegida {
  pilar: string
  fuerza: Fuerza | null
}

export function eleccionDe(pilares: PilaresDeTema): EleccionDePilares {
  return {
    principal: {
      linkedin: pilares.linkedin.principal?.slug ?? "",
      instagram: pilares.instagram.principal?.slug ?? "",
    },
    secundarios: {
      linkedin: pilares.linkedin.secundarios.map((pilar) => pilar.slug),
      instagram: pilares.instagram.secundarios.map((pilar) => pilar.slug),
    },
    capas: REDES.flatMap((red) => {
      const capa = pilares[red].capa
      return capa ? [capa.slug] : []
    }),
  }
}

/**
 * The rows the form saves: each network's main pillar `alta` and its secondaries `media` (the main one left out), the
 * layers without strength. A network without a main pillar keeps no secondaries (`secundario_sin_principal`).
 */
export function filasDeEleccion(eleccion: EleccionDePilares): FilaDePilarElegida[] {
  const pilares = REDES.flatMap((red): FilaDePilarElegida[] => {
    const principal = eleccion.principal[red]
    if (principal === "") return []
    return [
      { pilar: principal, fuerza: "alta" },
      ...eleccion.secundarios[red]
        .filter((slug) => slug !== principal)
        .map((pilar): FilaDePilarElegida => ({ pilar, fuerza: "media" })),
    ]
  })
  return [...pilares, ...eleccion.capas.map((pilar): FilaDePilarElegida => ({ pilar, fuerza: null }))]
}

/** Two choices save the same rows: the order she ticked the «También toca» in does not count. */
export function mismaEleccion(a: EleccionDePilares, b: EleccionDePilares): boolean {
  const clave = (eleccion: EleccionDePilares) =>
    filasDeEleccion(eleccion)
      .map((fila) => `${fila.pilar}:${fila.fuerza ?? ""}`)
      .toSorted()
      .join("|")
  return clave(a) === clave(b)
}

/**
 * The part of a choice the form can show: a pillar or layer retired since it was saved has no option, and saving it
 * back would be refused (`pilar_desconocido`), so it leaves the choice.
 */
export function eleccionDisponible(eleccion: EleccionDePilares, opciones: readonly PilarDeRed[]): EleccionDePilares {
  const hay = (red: Red | null, esCapa: boolean) => (slug: string) =>
    opciones.some((opcion) => opcion.slug === slug && opcion.esCapa === esCapa && (red === null || opcion.red === red))
  const principal = (red: Red) => (hay(red, false)(eleccion.principal[red]) ? eleccion.principal[red] : "")
  return {
    principal: { linkedin: principal("linkedin"), instagram: principal("instagram") },
    secundarios: {
      linkedin: eleccion.secundarios.linkedin.filter(hay("linkedin", false)),
      instagram: eleccion.secundarios.instagram.filter(hay("instagram", false)),
    },
    capas: eleccion.capas.filter(hay(null, true)),
  }
}

/** A choice drawn as a topic's pillars, as the page reads them back once saved (catalog order, short names). */
export function pilaresDeEleccion(eleccion: EleccionDePilares, opciones: readonly PilarDeRed[]): PilaresDeTema {
  const resultado = sinPilares()
  const visible = ({ slug, nombreCorto }: PilarDeRed): PilarVisible => ({ slug, nombre: nombreCorto, nombreCorto })
  const guardadas = new Set(filasDeEleccion(eleccion).map((fila) => fila.pilar))
  for (const opcion of opciones) {
    if (!guardadas.has(opcion.slug)) continue
    const deRed = resultado[opcion.red]
    if (opcion.esCapa) deRed.capa = visible(opcion)
    else if (eleccion.principal[opcion.red] === opcion.slug) deRed.principal = visible(opcion)
    else deRed.secundarios.push(visible(opcion))
  }
  return resultado
}
