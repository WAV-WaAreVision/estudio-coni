import { z } from "zod"
import { type Hallazgo, REGLAS_CLAUDE, REGLAS_DETERMINISTAS, type ReglaClaude } from "@/lib/dominio/revision"
import type { Json } from "@/lib/supabase/database.types"

const esquemaDeHallazgo = z.object({
  regla: z.enum([...REGLAS_DETERMINISTAS, ...REGLAS_CLAUDE]),
  tipo: z.enum(["bloquea", "advierte"]),
  mensaje: z.string(),
  frase: z.string().optional(),
})

/**
 * The findings of `piezas.revision`. The column is written by tasks and by `editarTexto`, never by Coni, so a shape
 * that does not parse is a bug to fix, not something to show her: it throws a plain Error.
 */
export function leerRevision(valor: Json): Hallazgo[] {
  const resultado = z.array(esquemaDeHallazgo).safeParse(valor)
  if (!resultado.success) {
    throw new Error(`La revisión guardada de la pieza no tiene el formato esperado: ${resultado.error.message}`)
  }
  return resultado.data
}

const REGLAS_DE_CLAUDE: readonly string[] = REGLAS_CLAUDE

/** What Claude judged (the rules only it can decide); an edit of the caption keeps these and redoes the rest. */
export function esJuicioDeClaude(hallazgo: Hallazgo): hallazgo is Hallazgo & { regla: ReglaClaude } {
  return REGLAS_DE_CLAUDE.includes(hallazgo.regla)
}
