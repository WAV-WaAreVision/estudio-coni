// Brandkit 9.24: skeleton bars in the final shape (title, filters, rows), never a spinner.
export default function CargandoLaBiblioteca() {
  return (
    <output className="grid gap-6" aria-label="Cargando">
      <div className="esqueleto h-3 w-1/3" />
      <div className="flex gap-2">
        {[0, 1, 2].map((chip) => (
          <div key={chip} className="esqueleto h-3 w-20" />
        ))}
      </div>
      {[0, 1, 2, 3].map((fila) => (
        <div key={fila} className="grid gap-2 border-b border-hilo py-3">
          <div className="esqueleto h-3 w-4/5" />
          <div className="esqueleto h-3 w-2/5" />
        </div>
      ))}
    </output>
  )
}
