// Writes tests/fixtures/excel-linkedin.xlsx from tests/fixtures/excel-linkedin.ts: every cell as text and empty cells
// left blank, as LinkedIn writes them.
//   pnpm fixture:excel-linkedin
import writeExcelFile, { type Row } from "write-excel-file/node"
import { EXCEL_DE_PRUEBA, HOJAS_DE_PRUEBA } from "@/tests/fixtures/excel-linkedin"

const comoTexto = (fila: readonly string[]): Row =>
  fila.map((valor) => (valor === "" ? null : { value: valor, type: String }))

async function principal(): Promise<void> {
  await writeExcelFile(HOJAS_DE_PRUEBA.map(({ sheet, data }) => ({ sheet, data: data.map(comoTexto) }))).toFile(
    EXCEL_DE_PRUEBA,
  )
  console.log(`Escribí ${EXCEL_DE_PRUEBA}`)
}

principal().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
