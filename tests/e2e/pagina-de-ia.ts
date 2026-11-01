import { pool } from "../integration/db"

/** Four short paragraphs, over the 300 characters the table asks for. */
export const TEXTO_DE_PRUEBA = [
  "Uso IA para preparar mi contenido y te cuento cómo lo hago, con palabras simples y sin rodeos.",
  "Algunos videos los hace mi avatar digital y cada uno lo dice en su texto, para que lo sepas siempre.",
  "Los textos los escribo con apoyo de IA y los firmo yo, después de leerlos y corregirlos uno por uno.",
  "Nunca uso datos de mis pacientes, y cuando cito un estudio dejo la fuente para que la revises tú.",
].join("\n\n")

/** Leaves only WAV's draft, as before Coni's first publication. */
export async function quitarPaginaDeIa(): Promise<void> {
  await pool.query("delete from public.transparencia_versiones where not propuesta")
}

/** Publishes `textos` as versions 1, 2, ...; the last one is the current page. */
export async function publicarPaginaDeIa(...textos: string[]): Promise<void> {
  await quitarPaginaDeIa()
  for (const [indice, texto] of textos.entries()) {
    await pool.query(
      "insert into public.transparencia_versiones (version, texto, motivo, vigente) values ($1, $2, 'Prueba de extremo a extremo', $3)",
      [indice + 1, texto, indice === textos.length - 1],
    )
  }
}
