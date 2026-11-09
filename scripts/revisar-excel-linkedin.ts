// Reads a LinkedIn export the way the importer does and prints what it sees. Writes nothing.
//   pnpm revisar:excel-linkedin <ruta al .xlsx>
import { readFileSync } from "node:fs"
import { leerHojas } from "@/lib/metricas/excel-linkedin/archivo"
import { leerExcelDeLinkedin } from "@/lib/metricas/excel-linkedin/leer"

async function principal(): Promise<void> {
  const [ruta] = process.argv.slice(2)
  if (!ruta) throw new Error("Uso: pnpm revisar:excel-linkedin <ruta al .xlsx>")
  const leidas = await leerHojas(new Blob([new Uint8Array(readFileSync(ruta))]))
  if (!leidas.ok) throw new Error(`No es un .xlsx: ${leidas.error}`)
  console.log(`Hojas: ${[...leidas.hojas.keys()].join(", ")}`)
  const lectura = leerExcelDeLinkedin(leidas.hojas)
  if (!lectura.ok) throw new Error(`El importador lo rechaza: ${lectura.error}`)
  const { periodo, publicaciones, seguidores, llegoAlTope, sinIdentificar } = lectura.excel
  console.log(`Período: ${periodo.desde} a ${periodo.hasta}`)
  console.log(
    `Publicaciones: ${publicaciones.length} (sin identificar: ${sinIdentificar}; lista llena: ${llegoAlTope})`,
  )
  console.log(`Seguidores: ${seguidores ?? "no vienen"}`)
  for (const post of publicaciones.slice(0, 5)) console.log(JSON.stringify(post))
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
