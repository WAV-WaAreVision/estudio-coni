export function MuyPronto({ titulo }: { titulo: string }) {
  return (
    <section className="grid gap-3">
      <h1 className="text-pantalla text-balance">{titulo}</h1>
      <p className="text-cuerpo text-apagado">Muy pronto.</p>
    </section>
  )
}
