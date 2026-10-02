// Regenerates the binary fixtures: `pnpm tsx tests/fixtures/ingesta/generar.ts`
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

const CARPETA = __dirname

function pdf(paginas: string[]): Buffer {
  const objetos: string[] = []
  const idsPaginas = paginas.map((_, i) => 4 + i * 2)
  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objetos[2] = `<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  paginas.forEach((texto, i) => {
    const flujo = texto === "" ? "" : `BT /F1 18 Tf 72 700 Td (${texto}) Tj ET`
    objetos[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`
    objetos[5 + i * 2] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`
  })
  let salida = "%PDF-1.4\n"
  const posiciones: number[] = []
  for (let id = 1; id < objetos.length; id++) {
    posiciones[id] = salida.length
    salida += `${id} 0 obj\n${objetos[id]}\nendobj\n`
  }
  const xref = salida.length
  salida += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objetos.length; id++) salida += `${String(posiciones[id]).padStart(10, "0")} 00000 n \n`
  salida += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(salida, "latin1")
}

async function docx(parrafos: string[]): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  const cuerpo = parrafos.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}</w:body></w:document>`,
  )
  return zip.generateAsync({ type: "nodebuffer" })
}

async function main() {
  writeFileSync(join(CARPETA, "dos-paginas.pdf"), pdf(["Primera pagina del documento", "Segunda pagina del documento"]))
  writeFileSync(join(CARPETA, "en-blanco.pdf"), pdf([""]))
  writeFileSync(join(CARPETA, "ejemplo.docx"), await docx(["Hola desde Word", "Segundo parrafo del documento"]))
  writeFileSync(join(CARPETA, "vacio.docx"), await docx([]))
}

main()
