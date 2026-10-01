export function MuyPronto({ titulo }: { titulo: string }) {
  return (
    <section className="grid gap-2.5">
      <h1 className="font-serif text-display text-balance">{titulo}</h1>
      <p className="text-apagado">Muy pronto.</p>
    </section>
  )
}
