// Maintainer tool: curates the looks Coni can choose on the Guion screen.
//   pnpm avatares:agregar <look_id> "<nombre>" [--sql]
//   pnpm avatares:quitar <look_id>
// Reads the look from HeyGen API v3 (HEYGEN_API_KEY) and keeps its preview photo in the private R2 bucket
// (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET). It prints what to add to `ajustes.produccion`
// and NEVER writes to the database: apply the printed JSON or SQL yourself.
import { agregarAvatar, sqlParaAgregar, sqlParaQuitar } from "@/lib/avatares/agregar"
import { exigirEnv } from "@/lib/env"
import { almacenReal } from "@/lib/proveedores/almacen"

const USO = 'Uso: pnpm avatares:agregar <look_id> "<nombre>" [--sql]  |  pnpm avatares:quitar <look_id>'

async function principal(): Promise<void> {
  const [orden, ...resto] = process.argv.slice(2)
  const conSql = resto.includes("--sql")
  const argumentos = resto.filter((argumento) => argumento !== "--sql")

  if (orden === "quitar") {
    const [lookId] = argumentos
    if (!lookId) throw new Error(USO)
    console.log(sqlParaQuitar(lookId))
    return
  }
  if (orden !== "agregar") throw new Error(USO)
  const [lookId, nombre] = argumentos
  if (!lookId || !nombre) throw new Error(USO)

  const { entrada, advertencia } = await agregarAvatar({
    lookId,
    nombre,
    clave: exigirEnv("HEYGEN_API_KEY", process.env.HEYGEN_API_KEY),
    almacen: almacenReal(),
  })
  if (advertencia) console.error(advertencia)
  console.error(`Foto guardada en R2: ${entrada.imagen}`)
  console.log(conSql ? sqlParaAgregar(entrada) : JSON.stringify(entrada, null, 2))
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
