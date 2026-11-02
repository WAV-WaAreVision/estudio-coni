import { Volver } from "@/components/ui/volver"

// What `notFound()` of any Biblioteca page shows (4m): plain words and the way back, on the left (4f).
export default function NoEncontradoEnLaBiblioteca() {
  return (
    <div className="grid gap-4">
      <Volver href="/biblioteca">Materiales</Volver>
      <h1 className="text-pantalla text-balance">No encontré lo que buscabas</h1>
      <p className="text-cuerpo text-apagado">
        Puede que el enlace esté incompleto o que ese material ya no esté en la Biblioteca.
      </p>
    </div>
  )
}
