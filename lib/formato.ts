/** 62.4 seconds as "1:02", the way players write time. Unknown lengths read as zero. */
export function mmss(segundos: number): string {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.round(segundos) : 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** Dollars the way Coni reads them: "US$ 2,40". */
export function dolares(monto: number): string {
  return `US$ ${monto.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
