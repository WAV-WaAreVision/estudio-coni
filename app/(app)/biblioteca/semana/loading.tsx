// Brandkit 9.24: skeleton bars in the final shape (the run panel first on the phone, right on a computer), never a spinner.
export default function CargandoLaSemana() {
  return (
    <output aria-label="Cargando" className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-x-8">
      <div className="grid content-start gap-3 rounded-panel bg-piedra-alta p-5 md:col-start-2 md:row-start-1">
        <div className="esqueleto h-3 w-1/2" />
        <div className="esqueleto h-3 w-1/3" />
        <div className="esqueleto min-h-objetivo w-full" />
      </div>
      <div className="grid content-start gap-4 md:col-start-1 md:row-start-1">
        <div className="esqueleto h-3 w-1/3" />
        {[0, 1, 2].map((fila) => (
          <div key={fila} className="grid gap-2 rounded-panel bg-piedra-alta p-5">
            <div className="esqueleto h-3 w-4/5" />
            <div className="esqueleto h-3 w-3/5" />
          </div>
        ))}
      </div>
    </output>
  )
}
