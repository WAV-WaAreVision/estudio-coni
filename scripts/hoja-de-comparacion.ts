// Puts each app capture next to its mockup board in ONE self-contained HTML (images inline), for the one-time human
// review of the redesign against the design. Run `VISUAL_BASELINES=1 pnpm test:e2e tests/e2e/visual.spec.ts
// --update-snapshots` first, then `pnpm comparar [salida.html]`.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const CAPTURAS = join(process.cwd(), "tests", "e2e", "visual.spec.ts-snapshots")
const MAQUETAS = join(process.cwd(), "docs", "rediseno", "pantallas")
const SALIDA = process.argv[2] ?? join(homedir(), "Projects", "conidolly-rediseno", "comparacion.html")

interface Seccion {
  titulo: string
  /** The app captures, by snapshot name, left to right. */
  capturas: { nombre: string; rotulo: string }[]
  /** The mockup board; null where the design has no board for the screen. */
  maqueta: string | null
  nota?: string
}

const SECCIONES: Seccion[] = [
  { titulo: "Ingreso", capturas: [{ nombre: "ingreso", rotulo: "Paso inicial" }], maqueta: "ingreso.png" },
  { titulo: "Inicio", capturas: [{ nombre: "inicio", rotulo: "Con piezas" }], maqueta: "inicio.png" },
  { titulo: "Inicio vacío", capturas: [{ nombre: "inicio-vacio", rotulo: "Sin firmas" }], maqueta: "inicio-vacio.png" },
  { titulo: "Ideas", capturas: [{ nombre: "ideas", rotulo: "Mazo" }], maqueta: "ideas.png" },
  {
    titulo: "Guion por aprobar",
    capturas: [{ nombre: "guion-por-aprobar", rotulo: "Puerta 1" }],
    maqueta: "guion-por-aprobar.png",
    nota: "La barra fija aparece a mitad de la captura de página completa: es la captura, no el diseño.",
  },
  {
    titulo: "Guion aprobado, sin voz",
    capturas: [{ nombre: "guion-aprobado-sin-voz", rotulo: "Falta grabar" }],
    maqueta: "guion-aprobado-sin-voz.png",
  },
  {
    titulo: "Guion con voz",
    capturas: [{ nombre: "guion-con-voz", rotulo: "Voz lista" }],
    maqueta: "guion-con-voz.png",
  },
  {
    titulo: "Guion grabando",
    capturas: [{ nombre: "guion-grabando", rotulo: "Grabando la voz" }],
    maqueta: "guion-grabando.png",
  },
  {
    titulo: "Guion con error",
    capturas: [{ nombre: "guion-error", rotulo: "Error de producción" }],
    maqueta: "guion-error.png",
    nota: "La maqueta aún muestra «Volver a Inicio» y la barra con Reintentar; el plan los quitó (un solo camino de vuelta arriba).",
  },
  {
    titulo: "Video por aprobar",
    capturas: [{ nombre: "video-por-aprobar", rotulo: "Puerta 2, al abrir" }],
    maqueta: "video-por-aprobar.png",
  },
  {
    titulo: "Calendario",
    capturas: [
      { nombre: "calendario-mes", rotulo: "Mes" },
      { nombre: "calendario-agenda", rotulo: "Agenda" },
      { nombre: "calendario-ritmo", rotulo: "Ritmo" },
    ],
    maqueta: "calendario.png",
  },
  {
    titulo: "Métricas",
    capturas: [{ nombre: "metricas", rotulo: "Con tres reels" }],
    maqueta: "metricas.png",
    nota: "Los datos de la captura son de prueba: las cifras y las fechas no son las de la maqueta.",
  },
  {
    titulo: "Ajustes y Cuentas conectadas",
    capturas: [
      { nombre: "ajustes", rotulo: "Ajustes" },
      { nombre: "ajustes-cuentas", rotulo: "Cuentas conectadas (nivel propio)" },
    ],
    maqueta: "ajustes.png",
    nota: "La maqueta muestra las cuentas dentro de Ajustes; el plan las pasó a su propio nivel (decisión de Federico).",
  },
  {
    titulo: "Página pública /l",
    capturas: [{ nombre: "l", rotulo: "Enlace de la bio" }],
    maqueta: null,
    nota: "No hay lámina de maqueta para /l: se compara con la sección 2 del brandkit.",
  },
]

const aDatos = (ruta: string) => `data:image/png;base64,${readFileSync(ruta).toString("base64")}`

function figura(ruta: string, rotulo: string): string {
  if (!existsSync(ruta))
    return `<figure><figcaption>${rotulo}</figcaption><p class="falta">Falta la captura: ${ruta}</p></figure>`
  return `<figure><figcaption>${rotulo}</figcaption><img src="${aDatos(ruta)}" alt="${rotulo}" /></figure>`
}

function seccionHtml(seccion: Seccion): string {
  const izquierda = seccion.capturas.map((c) => figura(join(CAPTURAS, `${c.nombre}-app-darwin.png`), c.rotulo)).join("")
  const derecha = seccion.maqueta
    ? figura(join(MAQUETAS, seccion.maqueta), "Maqueta aprobada")
    : '<figure><figcaption>Maqueta aprobada</figcaption><p class="falta">Sin lámina para esta pantalla.</p></figure>'
  return `<section>
  <h2>${seccion.titulo}</h2>
  ${seccion.nota ? `<p class="nota">${seccion.nota}</p>` : ""}
  <div class="par"><div class="lado"><h3>Aplicación</h3><div class="fila">${izquierda}</div></div><div class="lado"><h3>Maqueta</h3><div class="fila">${derecha}</div></div></div>
</section>`
}

const html = `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Calma suiza: la app junto a la maqueta</title>
<style>
  :root { --fondo: #f7f6f3; --tinta: #1d1b18; --apagado: #69645d; --linea: #d9d5cd; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 24px 96px; background: var(--fondo); color: var(--tinta); font: 16px/1.5 system-ui, sans-serif; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  p.intro { max-width: 70ch; color: var(--apagado); margin: 0 0 40px; }
  section { border-top: 1px solid var(--tinta); padding-top: 16px; margin-top: 48px; }
  h2 { font-size: 20px; margin: 0 0 4px; }
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--apagado); margin: 16px 0 8px; }
  .nota { margin: 0 0 8px; color: var(--apagado); max-width: 80ch; }
  .par { display: flex; gap: 48px; align-items: flex-start; flex-wrap: wrap; }
  .fila { display: flex; gap: 24px; align-items: flex-start; }
  figure { margin: 0; }
  figcaption { font-size: 13px; color: var(--apagado); margin-bottom: 6px; }
  img { display: block; width: 390px; max-width: none; height: auto; border: 1px solid var(--linea); background: #fff; }
  .falta { width: 390px; padding: 24px; border: 1px dashed var(--linea); color: var(--apagado); }
</style>
</head>
<body>
<h1>Calma suiza: la app junto a la maqueta</h1>
<p class="intro">Cada pantalla tal como la dibuja la app hoy (390 px de ancho, página completa, modo claro) a la izquierda, y la lámina de la maqueta aprobada a la derecha. Las láminas son tableros con varios estados; la captura muestra uno. El contenido de la captura es de prueba. Falta tu visto bueno para fijar estas capturas como referencia de las pruebas visuales.</p>
${SECCIONES.map(seccionHtml).join("\n")}
</body>
</html>
`

writeFileSync(SALIDA, html)
console.log(`hoja: ${SALIDA} (${(html.length / 1024 / 1024).toFixed(1)} MB)`)
