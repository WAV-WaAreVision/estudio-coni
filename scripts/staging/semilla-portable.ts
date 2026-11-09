// Issue 7: migrations create some rows (pillars, their angles and weights, Coni as an author) with gen_random_uuid(),
// so their ids differ in every database. This turns a local `pg_dump --column-inserts` into a seed that loads into
// any database built from the migrations: those rows are inserted only when their natural key is missing, and every
// reference to them becomes a lookup by that key.

type Fila = { tabla: string; columnas: string[]; valores: string[] }

const CATEGORIAS = "public.categorias"
const ANGULOS = "public.pilar_angulos"
const PESOS = "public.pilar_pesos"
const AUTORES = "public.autores"

/** Splits the dump into statements, skipping comments and psql meta-commands, honouring quoted text. */
function sentencias(dump: string): string[] {
  const resultado: string[] = []
  let actual = ""
  let enComillas = false
  let i = 0
  while (i < dump.length) {
    const c = dump[i]
    if (!enComillas && actual.trim() === "" && (dump.startsWith("--", i) || c === "\\")) {
      const fin = dump.indexOf("\n", i)
      i = fin === -1 ? dump.length : fin + 1
      actual = ""
      continue
    }
    actual += c
    if (c === "'") enComillas = !enComillas
    else if (c === ";" && !enComillas) {
      resultado.push(actual.trim())
      actual = ""
    }
    i++
  }
  if (actual.trim() !== "") throw new Error(`El volcado termina a mitad de una sentencia: ${actual.slice(0, 80)}`)
  return resultado
}

/** Splits on top-level commas: outside quotes and parentheses. */
function separar(lista: string): string[] {
  const partes: string[] = []
  let actual = ""
  let enComillas = false
  let profundidad = 0
  for (const c of lista) {
    if (c === "'") enComillas = !enComillas
    else if (!enComillas && c === "(") profundidad++
    else if (!enComillas && c === ")") profundidad--
    if (c === "," && !enComillas && profundidad === 0) {
      partes.push(actual.trim())
      actual = ""
    } else actual += c
  }
  partes.push(actual.trim())
  return partes
}

const INSERT = /^INSERT INTO (\S+) \(([^)]*)\) VALUES \(([\s\S]*)\) ON CONFLICT DO NOTHING;$/

function leer(sentencia: string): Fila {
  const partes = INSERT.exec(sentencia)
  if (!partes)
    throw new Error(
      `Sentencia inesperada en el volcado (usa --column-inserts --on-conflict-do-nothing): ${sentencia.slice(0, 120)}`,
    )
  const [, tabla, columnas, valores] = partes
  const fila = { tabla, columnas: separar(columnas), valores: separar(valores) }
  if (fila.columnas.length !== fila.valores.length) throw new Error(`Columnas y valores no calzan en ${tabla}`)
  return fila
}

function valor(fila: Fila, columna: string): string {
  const i = fila.columnas.indexOf(columna)
  if (i === -1) throw new Error(`${fila.tabla} no trae la columna ${columna}`)
  return fila.valores[i]
}

/** Local id literal of every migration-owned row, mapped to a lookup of the same row by its natural key. */
function busquedas(filas: Fila[]): Map<string, string> {
  const mapa = new Map<string, string>()
  const slugDePilar = new Map<string, string>()
  for (const fila of filas.filter((f) => f.tabla === CATEGORIAS)) {
    slugDePilar.set(valor(fila, "id"), valor(fila, "slug"))
    mapa.set(valor(fila, "id"), `(SELECT id FROM ${CATEGORIAS} WHERE slug = ${valor(fila, "slug")})`)
  }
  for (const fila of filas.filter((f) => f.tabla === AUTORES)) {
    mapa.set(
      valor(fila, "id"),
      `(SELECT id FROM ${AUTORES} WHERE nombre_normalizado = public.unaccent_inmutable(lower(btrim(${valor(fila, "nombre")}))))`,
    )
  }
  for (const fila of filas.filter((f) => f.tabla === ANGULOS)) {
    const pilar = slugDePilar.get(valor(fila, "pilar_id"))
    if (pilar === undefined)
      throw new Error(`El ángulo ${valor(fila, "id")} apunta a un pilar que no está en el volcado`)
    mapa.set(
      valor(fila, "id"),
      `(SELECT a.id FROM ${ANGULOS} a JOIN ${CATEGORIAS} c ON c.id = a.pilar_id WHERE c.slug = ${pilar} AND a.slug = ${valor(fila, "slug")})`,
    )
  }
  return mapa
}

/** Natural-key condition of a migration-owned row, or null for rows the seed owns. */
function claveNatural(fila: Fila): string | null {
  switch (fila.tabla) {
    case CATEGORIAS:
      return `slug = ${valor(fila, "slug")}`
    case AUTORES:
      return `nombre_normalizado = public.unaccent_inmutable(lower(btrim(${valor(fila, "nombre")})))`
    case ANGULOS:
      return `pilar_id = ${valor(fila, "pilar_id")} AND slug = ${valor(fila, "slug")}`
    case PESOS:
      return `pilar_id = ${valor(fila, "pilar_id")} AND desde = ${valor(fila, "desde")}`
    default:
      return null
  }
}

function escribir(original: Fila, mapa: Map<string, string>): string {
  const propia = claveNatural(original) !== null
  const valores = original.valores.map((v, i) => {
    // A migration-owned row keeps its own id: it is used only when the row is new to the target database.
    if (propia && original.columnas[i] === "id") return v
    const busqueda = mapa.get(v)
    if (busqueda !== undefined) return busqueda
    for (const id of mapa.keys()) {
      if (v.includes(id.slice(1, -1))) {
        throw new Error(
          `${original.tabla}.${original.columnas[i]} guarda el id local ${id} de una fila de las migraciones dentro de un valor; agrega cómo traducirlo`,
        )
      }
    }
    return v
  })
  const fila = { ...original, valores }
  const columnas = fila.columnas.join(", ")
  const clave = claveNatural(fila)
  if (clave === null)
    return `INSERT INTO ${fila.tabla} (${columnas}) VALUES (${valores.join(", ")}) ON CONFLICT DO NOTHING;`
  return `INSERT INTO ${fila.tabla} (${columnas}) SELECT ${valores.join(", ")} WHERE NOT EXISTS (SELECT 1 FROM ${fila.tabla} WHERE ${clave});`
}

export function hacerPortable(dump: string): string {
  const filas = sentencias(dump)
    .filter((s) => !/^(SET|SELECT) /.test(s))
    .map(leer)
  const mapa = busquedas(filas)
  // Like pg_dump --disable-triggers, without needing a superuser: the state guards (proteger_pieza,
  // proteger_carrusel, sellar_edicion...) reject rows that are already past their gates. LOCAL keeps it to the
  // seed's own transaction (psql -1).
  return `SET LOCAL session_replication_role = replica;\n${filas.map((f) => escribir(f, mapa)).join("\n")}\n`
}
