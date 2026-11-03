// Started by playwright.config.ts as a web server of the run (see almacen-falso-servidor.ts).
import { crearAlmacenFalso } from "./almacen-falso-servidor"

const PUERTO = Number(process.env.PUERTO_ALMACEN_FALSO ?? 3203)

crearAlmacenFalso().listen(PUERTO, "127.0.0.1", () => {
  console.log(`almacén falso en http://127.0.0.1:${PUERTO}`)
})
