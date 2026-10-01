import { pool } from "../integration/db"
import { vaciarPiezasEIdeas } from "../integration/siembra"

// The run owns the local database while it lasts; it leaves it as `pnpm db:reset` would, so `pnpm test:db` (which
// counts the pieces a role can see) does not find the run's leftovers.
export default async function limpiar(): Promise<void> {
  await vaciarPiezasEIdeas()
  await pool.end()
}
