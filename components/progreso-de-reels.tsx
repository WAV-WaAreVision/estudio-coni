/** Eight small segments (brandkit 9.20): filled is a 4 px ink bar, empty a 1 px line. The text next to it says the same in words. */
export function ProgresoDeReels({ avance, meta }: { avance: number; meta: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid items-end gap-1"
      style={{ gridTemplateColumns: `repeat(${meta}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: meta }, (_, i) => (
        <span
          // The segments never reorder: their position is their identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decoration
          key={i}
          className={i < Math.min(avance, meta) ? "h-1 bg-tinta" : "h-px bg-campo"}
        />
      ))}
    </span>
  )
}
