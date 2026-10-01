import { http, passthrough } from "msw"
import { setupServer } from "msw/node"

// API and database of the local Supabase (supabase/config.toml). The database speaks TCP, which MSW never sees.
const HOSTS_LOCALES = ["127.0.0.1", "localhost"]
// SUPABASE_URL points a worktree at its own stack (another project_id and ports).
const PUERTO_DEL_ENTORNO = process.env.SUPABASE_URL ? Number(new URL(process.env.SUPABASE_URL).port) : Number.NaN
const PUERTOS_LOCALES = [54421, 54422, ...(Number.isInteger(PUERTO_DEL_ENTORNO) ? [PUERTO_DEL_ENTORNO] : [])]

// A passthrough handler instead of an `onUnhandledRequest` callback: with a callback, MSW 2.15 logs the
// error but still sends the request to the real network, so only the built-in "error" strategy blocks.
const supabaseLocal = HOSTS_LOCALES.flatMap((host) =>
  PUERTOS_LOCALES.map((puerto) => http.all(`http://${host}:${puerto}/*`, () => passthrough())),
)

/** The one MSW server of the test run: tests add their handlers with `servidor.use(...)`. */
export const servidor = setupServer(...supabaseLocal)
