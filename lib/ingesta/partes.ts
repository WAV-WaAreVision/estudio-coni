import { z } from "zod"

/** Where a piece of text lives in its source, so a citation can point back to it. */
export const Ubicacion = z.union([
  z.object({ pagina: z.number().nullable() }).strict(),
  z.object({ segundo: z.number(), pista: z.enum(["voz", "pantalla"]) }).strict(),
  z.object({ imagen: z.number() }).strict(),
])

export const Parte = z.object({ texto: z.string(), ubicacion: Ubicacion })

export type Ubicacion = z.infer<typeof Ubicacion>
export type Parte = z.infer<typeof Parte>
