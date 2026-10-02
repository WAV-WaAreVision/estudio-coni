// Service worker of Conidolly. It does two things and nothing else: show a push as a notification, and open the
// right screen when she taps it. No fetch handler and no cache (the app is online-only in this plan). It never adds an
// action button to a notification: approving happens inside the app, looking at the piece (design, Pass 2).
const TITULO_POR_DEFECTO = "Conidolly"
const CUERPO_POR_DEFECTO = "Tienes un aviso nuevo"

// Only a path of this same app: a push that names another address must not be able to send her there.
function rutaPropia(valor) {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//")) return "/"
  const destino = new URL(valor, self.location.origin)
  return destino.origin === self.location.origin ? destino.pathname + destino.search : "/"
}

function leerAviso(evento) {
  const vacio = { titulo: TITULO_POR_DEFECTO, cuerpo: CUERPO_POR_DEFECTO, url: "/" }
  if (!evento.data) return vacio
  let datos
  try {
    datos = evento.data.json()
  } catch (error) {
    // Not JSON (a test from the browser's own tools): the plain notice is the honest answer.
    if (!(error instanceof SyntaxError)) throw error
    return vacio
  }
  if (typeof datos !== "object" || datos === null) return vacio
  return {
    titulo: typeof datos.titulo === "string" && datos.titulo ? datos.titulo : vacio.titulo,
    cuerpo: typeof datos.cuerpo === "string" && datos.cuerpo ? datos.cuerpo : vacio.cuerpo,
    url: rutaPropia(datos.url),
  }
}

self.addEventListener("push", (evento) => {
  const aviso = leerAviso(evento)
  evento.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: "/icon",
      badge: "/icon",
      data: { url: aviso.url },
    }),
  )
})

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close()
  const url = rutaPropia(evento.notification.data ? evento.notification.data.url : undefined)
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas[0]
      if (abierta) return abierta.focus().then(() => abierta.navigate(url))
      return self.clients.openWindow(url)
    }),
  )
})
