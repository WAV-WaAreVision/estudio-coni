import type { Pilar } from "@/lib/dominio/pilares"

/** Most ideas she can turn into scripts at once. */
export const MAXIMO_DE_IDEAS = 5

export interface IdeaDelBanco {
  id: string
  pilar: Pilar
  fuerza: "alta" | "media" | "baja"
  numero: number | null
  /** She added it to the week's ideas from the bank ("Usar esta"): it goes first. */
  fijada?: boolean
}

const PESO_DE_FUERZA: Record<IdeaDelBanco["fuerza"], number> = { alta: 0, media: 1, baja: 2 }

/**
 * The ideas offered for the week: the ones she added from the bank come first (in the order of the bank); then the
 * pillars that came out least lately go first, one idea per pillar before any
 * pillar repeats, and inside a pillar the stronger idea and then the lower number. Same bank, same answer.
 */
export function sugerirIdeas(entrada: {
  banco: readonly IdeaDelBanco[]
  /** Pillars of the pieces started in the last weeks, one entry per piece. */
  recientes: readonly Pilar[]
  cuantas: number
}): IdeaDelBanco[] {
  const usos = new Map<Pilar, number>()
  for (const pilar of entrada.recientes) usos.set(pilar, (usos.get(pilar) ?? 0) + 1)

  const porNumero = (a: IdeaDelBanco, b: IdeaDelBanco) =>
    (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)
  const elegidas: IdeaDelBanco[] = entrada.banco
    .filter((idea) => idea.fijada)
    .sort(porNumero)
    .slice(0, entrada.cuantas)
  for (const idea of elegidas) usos.set(idea.pilar, (usos.get(idea.pilar) ?? 0) + 1)

  const pendientes = entrada.banco
    .filter((idea) => !elegidas.includes(idea))
    .sort(
      (a, b) =>
        PESO_DE_FUERZA[a.fuerza] - PESO_DE_FUERZA[b.fuerza] ||
        (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    )
  while (elegidas.length < entrada.cuantas && pendientes.length > 0) {
    // Each pick counts as a use of its pillar, so the next one goes to the pillar with the fewest.
    let mejor = 0
    for (let candidata = 1; candidata < pendientes.length; candidata++) {
      const pilarMejor = pendientes[mejor]?.pilar
      const pilarCandidata = pendientes[candidata]?.pilar
      if (!pilarMejor || !pilarCandidata) continue
      if ((usos.get(pilarCandidata) ?? 0) < (usos.get(pilarMejor) ?? 0)) mejor = candidata
    }
    const [idea] = pendientes.splice(mejor, 1)
    if (!idea) break
    usos.set(idea.pilar, (usos.get(idea.pilar) ?? 0) + 1)
    elegidas.push(idea)
  }
  return elegidas
}
