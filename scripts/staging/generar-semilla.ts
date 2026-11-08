// Issue 7: fills the LOCAL database with the E2E scenes (a piece in every state, the Biblioteca with authors and
// topics), so `pg_dump` can turn them into supabase/staging/semilla.sql. The helpers refuse any non-local database.
import { crearAlmacenFalso } from "../../tests/e2e/almacen-falso-servidor"
import { pool } from "../../tests/integration/db"
import { sembrarAutoresYTemas } from "../../tests/e2e/biblioteca-escena"
import { sembrarCarruselDeEscena, sembrarEscena } from "../../tests/e2e/escena"

async function principal() {
  // The Biblioteca scene stores its files through the E2E's fake R2; the dump keeps only the rows.
  const almacen = crearAlmacenFalso().listen(Number(process.env.PUERTO_ALMACEN_FALSO ?? 3203))
  await sembrarAutoresYTemas()
  await sembrarEscena()
  await sembrarCarruselDeEscena("carrusel_por_aprobar")
  await pool.end()
  almacen.close()
}

principal().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
