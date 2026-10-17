// Puts each app capture next to its Soft UI v6 render in ONE self-contained HTML (images inline), for the review of
// the migration against the design. Captures without masks, at 390 css px:
//   VISUAL_FINALES=<carpeta> pnpm test:e2e tests/e2e/visual.spec.ts
//   VISUAL_FINALES=<carpeta> pnpm comparar [salida.html]
// Without VISUAL_FINALES it reads the committed baselines (masked dates).
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const FINALES = process.env.VISUAL_FINALES
const CAPTURAS = FINALES ?? join(process.cwd(), "tests", "e2e", "visual.spec.ts-snapshots")
const SUFIJO = FINALES ? ".png" : "-app-darwin.png"
const V6 = join(homedir(), "Projects", "conidolly-rediseno", "soft-ui", "v6")
const SALIDA = process.argv[2] ?? join(homedir(), "Projects", "conidolly-rediseno", "comparacion-soft-ui.html")

interface Seccion {
  titulo: string
  /** The app captures, by snapshot name, left to right. */
  capturas: { nombre: string; rotulo: string }[]
  /** The v6 renders, by file name, left to right; empty where v6 has no board for the screen. */
  maquetas: string[]
  nota?: string
}

const SIN_LAMINA = "v6 no dibuja esta pantalla: se revisa contra la gramática (decisión 14)."

const SECCIONES: Seccion[] = [
  {
    titulo: "1. Inicio",
    capturas: [
      { nombre: "inicio", rotulo: "Con piezas" },
      { nombre: "inicio-letra-grande", rotulo: "Letra grande" },
    ],
    maquetas: ["1-inicio-completa.png", "1-inicio-200-completa.png"],
  },
  {
    titulo: "Inicio vacío",
    capturas: [{ nombre: "inicio-vacio", rotulo: "Sin firmas" }],
    maquetas: [],
    nota: SIN_LAMINA,
  },
  {
    titulo: "8. Inicio con fallas",
    capturas: [{ nombre: "inicio-con-fallas", rotulo: "Una falla y una hora vencida" }],
    maquetas: ["8-inicio-con-fallas-completa.png"],
  },
  {
    titulo: "2. Puerta 1, lista para firmar",
    capturas: [
      { nombre: "guion-escuchada", rotulo: "Voz escuchada" },
      { nombre: "guion-escuchada-letra-grande", rotulo: "Letra grande" },
    ],
    maquetas: ["2-guion-completa.png", "2-guion-200-completa.png"],
  },
  {
    titulo: "2b. Puerta 1, sin escuchar",
    capturas: [
      { nombre: "guion-sin-escuchar", rotulo: "Avatar elegido, voz sin escuchar" },
      { nombre: "guion-con-voz", rotulo: "Voz lista, sin avatar" },
      { nombre: "guion-por-aprobar", rotulo: "La escena" },
    ],
    maquetas: ["2b-guion-sin-escuchar-completa.png"],
  },
  {
    titulo: "3. Preparando la voz",
    capturas: [
      { nombre: "guion-preparando-voz", rotulo: "Con marcas de tono" },
      { nombre: "guion-grabando", rotulo: "Sin marcas" },
    ],
    maquetas: ["3-guion-preparando-voz-completa.png"],
  },
  {
    titulo: "4. Firmado, dentro de la ventana",
    capturas: [{ nombre: "guion-firmado-ventana", rotulo: "Deshacer en la página (segundos ocultos)" }],
    maquetas: ["4-grabando-video-completa.png", "4b-grabando-video-completa.png"],
  },
  {
    titulo: "7. La voz falló",
    capturas: [
      { nombre: "guion-falla-voz", rotulo: "Con su razón" },
      { nombre: "guion-sin-voz", rotulo: "Sin razón" },
    ],
    maquetas: ["7-falla-voz-completa.png"],
  },
  {
    titulo: "8b. El video falló",
    capturas: [{ nombre: "guion-error", rotulo: "Error de producción" }],
    maquetas: ["8b-falla-grabacion-completa.png"],
  },
  {
    titulo: "9. Sin saldo de HeyGen",
    capturas: [{ nombre: "guion-sin-saldo", rotulo: "La firma queda cerrada" }],
    maquetas: ["9-guion-sin-saldo-completa.png"],
  },
  {
    titulo: "5. Puerta 2, video visto",
    capturas: [{ nombre: "video-por-aprobar", rotulo: "Lista para firmar" }],
    maquetas: ["5-revision-completa.png"],
  },
  {
    titulo: "5b. Puerta 2, video sin terminar",
    capturas: [
      { nombre: "video-sin-terminar", rotulo: "Al abrir" },
      { nombre: "video-sin-terminar-letra-grande", rotulo: "Letra grande" },
    ],
    maquetas: ["5b-revision-sin-terminar-completa.png", "5b-revision-sin-terminar-200-completa.png"],
  },
  {
    titulo: "6. Cuentas",
    capturas: [
      { nombre: "ajustes-cuentas", rotulo: "Cuentas" },
      { nombre: "ajustes-cuentas-letra-grande", rotulo: "Letra grande" },
    ],
    maquetas: ["6-cuentas-completa.png", "6-cuentas-200-completa.png"],
    nota: "Sin el saldo por cuenta de la lámina: queda para la especificación de lógica (pendiente h).",
  },
  {
    titulo: "6b. Desconectar LinkedIn",
    capturas: [{ nombre: "cuentas-desconectar", rotulo: "Confirmación abierta" }],
    maquetas: ["6b-cuentas-desconectar-completa.png"],
  },
  { titulo: "Ajustes", capturas: [{ nombre: "ajustes", rotulo: "Ajustes" }], maquetas: [], nota: SIN_LAMINA },
  { titulo: "Ideas", capturas: [{ nombre: "ideas", rotulo: "Mazo" }], maquetas: [], nota: SIN_LAMINA },
  {
    titulo: "Calendario",
    capturas: [
      { nombre: "calendario-mes", rotulo: "Mes" },
      { nombre: "calendario-agenda", rotulo: "Agenda" },
      { nombre: "calendario-ritmo", rotulo: "Ritmo" },
    ],
    maquetas: [],
    nota: SIN_LAMINA,
  },
  { titulo: "Métricas", capturas: [{ nombre: "metricas", rotulo: "Con tres reels" }], maquetas: [], nota: SIN_LAMINA },
  {
    titulo: "Ingreso",
    capturas: [
      { nombre: "ingreso", rotulo: "Paso inicial" },
      { nombre: "ingreso-codigo-error", rotulo: "Código equivocado" },
    ],
    maquetas: [],
    nota: SIN_LAMINA,
  },
  {
    titulo: "Página pública /l",
    capturas: [{ nombre: "l", rotulo: "Enlace de la bio" }],
    maquetas: [],
    nota: "Frambuesa de borde a borde (decisión 16): se compara con la sección 2 del brandkit.",
  },
]

const aDatos = (ruta: string) => `data:image/png;base64,${readFileSync(ruta).toString("base64")}`

function figura(ruta: string, rotulo: string): string {
  if (!existsSync(ruta))
    return `<figure><figcaption>${rotulo}</figcaption><p class="falta">Falta la captura: ${ruta}</p></figure>`
  return `<figure><figcaption>${rotulo}</figcaption><img src="${aDatos(ruta)}" alt="${rotulo}" /></figure>`
}

function seccionHtml(seccion: Seccion): string {
  const izquierda = seccion.capturas.map((c) => figura(join(CAPTURAS, `${c.nombre}${SUFIJO}`), c.rotulo)).join("")
  const derecha =
    seccion.maquetas.length > 0
      ? seccion.maquetas.map((archivo) => figura(join(V6, archivo), archivo)).join("")
      : '<figure><figcaption>Soft UI v6</figcaption><p class="falta">Sin lámina para esta pantalla.</p></figure>'
  return `<section>
  <h2>${seccion.titulo}</h2>
  ${seccion.nota ? `<p class="nota">${seccion.nota}</p>` : ""}
  <div class="par"><div class="lado"><h3>Aplicación</h3><div class="fila">${izquierda}</div></div><div class="lado"><h3>Soft UI v6</h3><div class="fila">${derecha}</div></div></div>
</section>`
}

const html = `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Soft UI v6: la app junto a las láminas</title>
<style>
  :root { --piedra: #ebebea; --luz: #fbfbfa; --tinta: #262626; --apagado: #5a5a59; --hilo: #dcdcdb; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 24px 96px; background: var(--piedra); color: var(--tinta); font: 16px/1.5 system-ui, sans-serif; }
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
  img { display: block; width: 390px; max-width: none; height: auto; border: 1px solid var(--hilo); background: var(--luz); }
  .falta { width: 390px; padding: 24px; border: 1px dashed var(--hilo); color: var(--apagado); }
</style>
</head>
<body>
<h1>Soft UI v6: la app junto a las láminas</h1>
<p class="intro">Cada estado tal como lo dibuja la app (390 px de ancho, página completa) a la izquierda, y el render de Soft UI v6 a la derecha, con su versión de letra grande cuando existe. El contenido de la captura es de prueba.</p>
${SECCIONES.map(seccionHtml).join("\n")}
</body>
</html>
`

writeFileSync(SALIDA, html)
console.log(`hoja: ${SALIDA} (${(html.length / 1024 / 1024).toFixed(1)} MB)`)
