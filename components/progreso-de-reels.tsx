/** Eight small segments, as many filled as reels so far. The text next to it always says the same in words. */
export function ProgresoDeReels({ avance, meta }: { avance: number; meta: number }) {
  return (
    <span aria-hidden="true" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${meta}, minmax(0, 1fr))` }}>
      {Array.from({ length: meta }, (_, i) => (
        <span
          // The segments never reorder: their position is their identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decoration
          key={i}
          className={i < Math.min(avance, meta) ? "h-2 rounded-full bg-acento" : "h-2 rounded-full bg-linea"}
        />
      ))}
    </span>
  )
}
