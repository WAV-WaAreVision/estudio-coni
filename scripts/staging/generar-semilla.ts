// Issue 7: fills the LOCAL database with the E2E scenes (a piece in every state, the Biblioteca with authors and
// topics), dumps those rows and writes supabase/staging/semilla.sql. The helpers refuse any non-local database.
//   pnpm exec tsx scripts/staging/generar-semilla.ts
import { execFile } from "node:child_process"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { crearAlmacenFalso } from "../../tests/e2e/almacen-falso-servidor"
import { sembrarAutoresYTemas } from "../../tests/e2e/biblioteca-escena"
import { sembrarCarruselDeEscena, sembrarEscena } from "../../tests/e2e/escena"
import { pool, URL_DB } from "../../tests/integration/db"
import { hacerPortable } from "./semilla-portable"

const TABLAS = [
  "afirmaciones",
  "autores",
  "carruseles",
  "categorias",
  "consultas",
  "fichas",
  "ideas",
  "materiales",
  "motor_corridas",
  "piezas",
  "pilar_angulos",
  "pilar_pesos",
  "publicaciones",
  "tema_pilares",
  "temas",
  "teoria_afirmaciones",
  "teorias",
]

const ENCABEZADO = `-- Issue 7: test content for the staging branch, generated from the E2E scenes by scripts/staging/generar-semilla.ts
-- (pg_dump data only, then scripts/staging/semilla-portable.ts). Rows the migrations create are inserted only when
-- missing and referenced by natural key, so this loads into any database built from the migrations. No personal
-- data. Users are created apart.

insert into public.ajustes select where not exists (select 1 from public.ajustes);

`

async function volcar(): Promise<string> {
  const argumentos = [
    "--data-only",
    "--column-inserts",
    "--on-conflict-do-nothing",
    "--no-owner",
    ...TABLAS.flatMap((tabla) => ["--table", `public.${tabla}`]),
    URL_DB,
  ]
  const { stdout } = await promisify(execFile)("pg_dump", argumentos, { maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

async function principal() {
  // The Biblioteca scene stores its files through the E2E's fake R2; the dump keeps only the rows.
  const almacen = crearAlmacenFalso().listen(Number(process.env.PUERTO_ALMACEN_FALSO ?? 3203))
  await sembrarAutoresYTemas()
  await sembrarEscena()
  await sembrarCarruselDeEscena("carrusel_por_aprobar")
  await pool.end()
  almacen.close()
  const destino = path.join(__dirname, "../../supabase/staging/semilla.sql")
  await writeFile(destino, ENCABEZADO + hacerPortable(await volcar()))
}

principal().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
