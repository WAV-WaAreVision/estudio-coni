import { clienteDeServicio } from "@/lib/acciones/servidor"
import { leerSecreto } from "@/lib/datos/repositorio"
import { baseDe } from "@/lib/proveedores/bases"
import { leerSaldoElevenlabs, leerSaldoHeygen } from "@/lib/proveedores/saldos"
import { lectorDeSaldos } from "./leer"

/** The balances the screens show. The local E2E run changes them between tests, so it does not cache. */
export const leerSaldos = lectorDeSaldos({
  leerLlave: (nombre) => leerSecreto(clienteDeServicio(), nombre),
  elevenlabs: (clave) =>
    leerSaldoElevenlabs({ clave, base: baseDe(process.env, "ELEVENLABS_BASE_URL", "https://api.elevenlabs.io") }),
  heygen: (clave) => leerSaldoHeygen({ clave, base: baseDe(process.env, "HEYGEN_BASE_URL", "https://api.heygen.com") }),
  ahora: () => Date.now(),
  ...(process.env.DISPARO_DE_PRUEBA === "1" ? { vigencia: { okMs: 0, fallaMs: 0 } } : {}),
})
