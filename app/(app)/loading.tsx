// Skeleton rows, never a spinner in the middle of the screen (docs/DESIGN.md, states of Inicio).
export default function Cargando() {
  return (
    <output className="grid gap-5.5" aria-label="Cargando">
      <div className="grid gap-2.5">
        <div className="esqueleto h-3.5 w-1/3" />
        <div className="esqueleto h-8 w-1/2" />
      </div>
      {[0, 1, 2].map((fila) => (
        <div key={fila} className="grid gap-2 border-b border-linea py-3">
          <div className="esqueleto h-5 w-4/5" />
          <div className="esqueleto h-3.5 w-3/5" />
        </div>
      ))}
    </output>
  )
}
