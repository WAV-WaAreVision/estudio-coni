// Brandkit 9.24: skeleton bars in the final shape, never a spinner in the middle of the screen.
export default function Cargando() {
  return (
    <output className="grid gap-6" aria-label="Cargando">
      <div className="esqueleto h-3 w-1/2" />
      {[0, 1, 2].map((fila) => (
        <div key={fila} className="grid gap-2 border-b border-hilo py-3">
          <div className="esqueleto h-3 w-4/5" />
          <div className="esqueleto h-3 w-3/5" />
        </div>
      ))}
    </output>
  )
}
