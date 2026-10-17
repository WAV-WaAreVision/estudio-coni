import type { Hallazgo } from "@/lib/dominio/revision"

const cuenta = (cantidad: number, uno: string, varios: string) =>
  cantidad === 1 ? `1 ${uno}` : `${cantidad} ${varios}`

/** Every pending finding is a warning that quotes a phrase: the screen talks about phrases. */
function todasConFrase(pendientes: readonly Hallazgo[]): boolean {
  return pendientes.every((hallazgo) => hallazgo.tipo === "advierte" && Boolean(hallazgo.frase))
}

/**
 * The figure beside "2. Revisa el guion" (decision 9, step 5): phrases when what is pending are phrases marked in the
 * reading (`marcadas`, the findings `resaltarFrases` highlighted), "N por revisar" otherwise (a phrase that is only
 * quoted in its panel is not marked), "Revisado" once nothing is pending, nothing without findings.
 */
export function cifraDeRevision(
  pendientes: readonly Hallazgo[],
  total: number,
  marcadas: ReadonlySet<Hallazgo>,
): string | null {
  if (total === 0) return null
  if (pendientes.length === 0) return "Revisado"
  if (todasConFrase(pendientes) && pendientes.every((hallazgo) => marcadas.has(hallazgo)))
    return pendientes.length === 1 ? "1 frase marcada" : `${pendientes.length} frases marcadas`
  return `${pendientes.length} por revisar`
}

/** The "Falta:" item of the warnings she has not ticked (decisions 9 and 11): "revisar 1 frase", "revisar 2 avisos". */
export function revisarPendientes(sinRevisar: readonly Hallazgo[]): string | null {
  if (sinRevisar.length === 0) return null
  return todasConFrase(sinRevisar)
    ? `revisar ${cuenta(sinRevisar.length, "frase", "frases")}`
    : `revisar ${cuenta(sinRevisar.length, "aviso", "avisos")}`
}
