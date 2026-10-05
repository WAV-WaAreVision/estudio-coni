# Mapeo de tokens: `app/globals.css` actual → sistema final

> Para implementar después. Origen: `~/Projects/estudio-coni/app/globals.css` (217 líneas, leído el
> 4 de octubre de 2026) y conteos con `grep` sobre `app/`, `components/` y `lib/` (solo lectura).
> Destino: `tokens.css` y `brandkit.md` de esta carpeta. Ningún archivo de `estudio-coni` se tocó.
> Los conteos son de utilidades de Tailwind (`bg-`, `text-`, `border-`…) por token; sirven para
> dimensionar, no reemplazan una búsqueda al migrar.

## 1. Resumen

| Tema | Hoy | Final |
|---|---|---|
| Neutros | rosados (`#fbf6f8`, tinta ciruela `#2b1830`) | piedra tibia y tinta tibia (`#f7f6f3`, `#1d1b18`) |
| Acento | frambuesa `#b3285f` en más de 10 papeles | `firma` `#a8285a` solo en el deslizador y en «sale el …» |
| Estados | pares tinta + fondo (6 tokens) | 3 tintas, sin fondos |
| Pilares | 5 tonos × 4 derivados | ninguno: el pilar es una palabra en `apagado` |
| Letra | Young Serif + Hanken Grotesk | Geist (paquete `geist`), una familia |
| Escala | 7 tokens + 16 y 17 px sueltos | 5 tamaños en `rem` (+ `marca` solo en `/l`) |
| Radios | 12 · 14 · 20 · 24 · píldora | 12 · círculo |
| Tema | solo claro | claro por defecto, oscuro que sigue a iOS |
| Íconos | `lucide-react` (16 archivos) | `@phosphor-icons/react` |

## 2. Color

| Token actual | Valor | Usos (archivos) | Token final | Valor | Qué hacer |
|---|---|---|---|---|---|
| `--fondo` | `#fbf6f8` | 2 (1) | `--fondo` | `#f7f6f3` | mismo nombre, valor nuevo |
| `--superficie` | `#fffcfd` | 30 (21) | `--superficie` | `#fcfbf9` | mismo nombre. Muchos usos son cajas que desaparecen (notas, bloques, cajas de texto); quedan barra de firma, carta de idea, toast y campos |
| `--hundido` | `#f5ecf0` | 20 (17) | `--pista` (solo donde sigue habiendo relleno) | `#ebe8e2` | sale. Segmentado → pestañas o fila con valor; botón deshabilitado → `bg-pista text-apagado`; nota «ocupada» → línea de estado o fila trabajando; caja de la cita de la idea propia y panel de comparación → sin caja; chip «48 s» → texto de meta |
| `--tinta` | `#2b1830` | 37 (22) | `--tinta` | `#1d1b18` | mismo nombre |
| `--apagado` | `#6f5d74` | 93 (34) | `--apagado` | `#69645d` | mismo nombre |
| `--linea` | `#eadde4` | 37 (27) | `--linea` (separadores) o `--campo` (bordes de control) | `#e5e2dc` · `#8a847b` | los bordes de campos, casillas, código y secundarias pasan a `border-campo` (hoy están a 1,23:1) |
| `--acento` | `#b3285f` | 43 (23): `bg` 5, `text` 17, `border`/`ring`/`outline`/`decoration` 9 | `--firma` solo en el deslizador y la fecha; `--tinta` o `--principal` en todo lo demás | `#a8285a` | `bg-acento` de botones → `bg-principal`; `text-acento` (volver, rótulos, botones callados, «Guardado») → `text-tinta` (o `text-exito` en «Guardado»); bordes de selección → `border-tinta`; foco → `--anillo-foco` |
| `--acento-profundo` | `#8e1d4a` | 2 (2) | (ninguno) | | sale: el hover de la principal es opacidad 92 % |
| `--acento-suave` | `#f6e3ec` | 7 (7) | (ninguno) / `--pista` | | sale. Pista del deslizador → `pista`; confirmaciones → sin relleno; hoy en el mes → círculo `tinta`; chip elegido → `tinta`; avatar elegido → anillo `tinta` |
| `--acento-claro` | `#f0b4cd` | 1 (1) | `--sobre-tinta` | `#fcfbf9` | «Deshacer» del toast, 600 subrayado |
| `--sobre-acento` | `#fff7fa` | 13 (5) | `--sobre-principal` · `--sobre-firma` | `#fcfbf9` | según esté sobre la principal o sobre la firma; en `/l`, `#fcfbf9` |
| `--ok-tinta` | `#1d6743` | 8 (6) | `--exito` | `#2e6a44` | |
| `--ok-fondo` | `#e5f3ea` | 8 (6) | (ninguno) | | sale: el éxito no pinta fondo |
| `--aviso-tinta` | `#7a4b00` | 11 (10) | `--aviso` | `#7d5410` | |
| `--aviso-fondo` | `#fdf1dc` | 11 (10) | (ninguno) | | sale |
| `--error-tinta` | `#a12a2a` | 22 (19) | `--error` | `#b3261e` | |
| `--error-fondo` | `#fbe8e6` | 20 (18) | (ninguno) | | sale |
| `accent-acento` (casillas y radios nativos) | | 9 (6) | casilla redonda propia | | transición: `accent-tinta` |

**Nuevos sin equivalente hoy:** `--campo`, `--pista`, `--principal`, `--sobre-principal`,
`--sobre-tinta`, `--firma`, `--sobre-firma`, `--firma-rastro`, `--velo-video`, `--sobre-video`,
`--foto-brillo`, `--anillo-foco`, `--peso-titulo` y todo el bloque oscuro.

## 3. Pilares

| Hoy | Final |
|---|---|
| `[data-pilar="pareja"]` … `[data-pilar="bienestar"]` con `--p-h` (245, 320, 50, 160, 85) | sin estilo; `data-pilar` puede quedar como dato |
| `--p-tinte`, `--p-tinte-fuerte`, `--p-tinta`, `--p-punto` y `--color-pilar-*` | salen. El nombre del pilar va en `text-apagado` |
| `pilar-tinte` 5 · `pilar-tinte-fuerte` 2 · `pilar-tinta` 8 · `pilar-punto` 4 usos · `data-pilar` 17 (10 archivos) | |

Archivos con estilos de pilar: `app/(app)/guion/[id]/pantalla-guion.tsx`,
`app/(app)/ideas-semana.tsx`, `app/(app)/ideas/carta-de-idea.tsx`, `app/(app)/ideas/idea-propia.tsx`,
`components/agenda-del-calendario.tsx`, `components/barra-de-metrica.tsx`,
`components/fila-pieza.tsx`, `components/mes-del-calendario.tsx`,
`components/ritmo-del-calendario.tsx`, `components/ui/pildora-pilar.tsx`.

## 4. Tipografía

**Familias.** `app/layout.tsx` carga `Hanken_Grotesk` y `Young_Serif` con `next/font/google`. Pasa a
`import { GeistSans } from "geist/font/sans"` (nueva dependencia `geist`; trae `≈`, que el
subconjunto de Google no trae) con `className={GeistSans.variable}` en `<html>`.

| Token actual | Usos (archivos) | Final | Nota |
|---|---|---|---|
| `--font-sans` (Hanken) | | `--font-sans: var(--font-geist-sans), …` | |
| `--font-serif` (Young Serif) · `font-serif` | 19 (17) | sale | títulos, gancho, guion y frase marcada pasan a Geist con su rol de tamaño |
| `--text-marca` 2.75rem / 1 | 3 (1) | `--text-marca` 2.75rem / 48/44 | solo `/l` |
| `--text-display` 1.875rem / 1.12 | 14 (11) | `--text-pantalla` 2rem / 36/32 · o `--text-pieza` | títulos de pantalla → `pantalla`; títulos de pieza en Guion y gancho de idea → `pieza` (hoy 30, final 24, igual que en Video) |
| `--text-title` 1.5rem / 1.15 | 5 (3) | `--text-pieza` o `--text-pantalla` | «Ideas» y «Buscar ideas» son títulos de pantalla → `pantalla`; el título de Video → `pieza` |
| `--text-script` 1.25rem / 1.55 | 3 (1) | `--text-guion` 1.25rem / 32/20 | igual al editar y al leer (hoy al leer es 17 a 18) |
| `--text-body` 1.125rem / 1.5 | 18 (13) | `--text-cuerpo` 1.125rem / 24/18 | en párrafos, `leading-prosa` (28/18) |
| `--text-label` 0.9375rem / 1.3 | 53 (28) | `--text-meta` + `font-semibold` | rótulos en tinta 600, no apagados |
| `--text-meta` 0.9375rem / 1.4 | 61 (31) | `--text-meta` 0.9375rem / 20/15 | |
| `text-[1rem]` (16 px suelto) | 26 | `text-cuerpo` si es el mensaje, `text-meta` si es detalle | toasts y cajas de error pasan a 18 |
| `text-[1.0625rem]` (17 px suelto) | 15 | `text-cuerpo` | resúmenes y notas |
| `text-[1.25rem]` | 3 | `text-cuerpo font-semibold` | títulos de bloque de Ajustes (los bloques desaparecen) |
| `text-[1.5rem]` | 1 | `text-pieza` | |

## 5. Forma, sombra y movimiento

| Actual | Usos (archivos) | Final |
|---|---|---|
| `--radius-sm` 12px | 12 (9) | `--radius-12` 12px (`rounded-12`) |
| `--radius-md` 14px | 35 (21) | `rounded-12` |
| `--radius-lg` 20px | 17 (14) | `rounded-12`, o nada: casi todos son notas y bloques que desaparecen |
| `--radius-xl` 24px | 1 (1, carta de idea) | `rounded-12` |
| `rounded-full` | 23 (15) | `rounded-full` (deslizador, casilla, interruptor, play, puntos) |
| `rounded-[9px]` | 1 | `rounded-12` |
| `--shadow-flotante` `0 10px 28px -14px rgb(43 24 48 / .45)` | 3 archivos (panel del video, barras, toast) | `--shadow-barra` (barras, hacia arriba) · `--shadow-flotante` (carta y toast). El panel del video sale |
| `shadow-sm` y `shadow-[0_1px_3px_…]` | 2 (segmentado, vistas del calendario) | salen con esos componentes |
| `--ease-fuerte` | 10 (5) | `--curva-salida` (misma curva) + `--curva-vuelta` para el pulgar; en Tailwind, `ease-salida` y `ease-vuelta` |
| duraciones literales 150 a 220 ms | | `--dur-corta`, `--dur-media`, `--dur-larga` (bajan a 0 con reducir movimiento) |

## 6. Reglas globales de `globals.css`

| Regla actual | Final |
|---|---|
| `:root { color-scheme: light; … }` | el `:root` de `tokens.css` + bloque oscuro (`prefers-color-scheme` con guarda `:not([data-theme="light"])` y `[data-theme="dark"]`) |
| `body { font-size: 1.125rem; line-height: 1.5; font-family: var(--font-sans) }` | `font-size: var(--t-cuerpo); line-height: var(--i-cuerpo); font-family: var(--letra)` |
| `:focus-visible { outline: 3px solid var(--acento); outline-offset: 2px }` | `outline: 2px solid transparent; box-shadow: var(--anillo-foco)` (el contorno transparente se ve en modo de alto contraste) |
| `.aviso` (toast) 220 ms + `@starting-style` | se queda con `var(--dur-media)` y `var(--curva-salida)`; duración visible de 4,5 s → 8 s (`--toast-duracion`) |
| `.esqueleto` fondo `--linea`, `latido` 1,6 s | fondo `var(--pista)`, mismo latido; quieto con reducir movimiento |
| `.deslizador` (`input type=range` restilizado) | sale: el nuevo deslizador es un componente de puntero (brandkit 9.12) |
| `.carta-idea` 220 ms | se queda con `var(--dur-larga)` |
| `body:has([data-superficie="marca"]) { background: var(--acento) }` | `background: var(--firma)` |

## 7. Valores fuera del CSS

| Dónde | Hoy | Final |
|---|---|---|
| `lib/diseno/marca.ts` `COLOR_DE_FONDO` | `#fbf6f8` | `#f7f6f3` (y uno nuevo, `COLOR_DE_FONDO_OSCURO` `#161513`) |
| `lib/diseno/marca.ts` `COLOR_DE_ACENTO` | `#b3285f` | `COLOR_DE_FIRMA` `#a8285a` |
| `lib/diseno/marca.ts` `COLOR_SOBRE_ACENTO` | `#fff7fa` | `COLOR_SOBRE_FIRMA` `#fcfbf9` |
| `app/layout.tsx` `viewport.themeColor` y `colorScheme` | `COLOR_DE_FONDO`, `"light"` | `themeColor` con dos entradas por `media` (claro y oscuro) y `colorScheme: "light dark"` |
| `app/l/page.tsx` `themeColor` | `COLOR_DE_ACENTO` | `COLOR_DE_FIRMA` |
| `app/manifest.ts` | fondo y tema en `COLOR_DE_FONDO` | igual, con el valor nuevo |
| `app/icon.tsx`, `app/apple-icon.tsx` | «C» en `#fff7fa` sobre `#b3285f` | cuadrado `#1d1b18`, «c» de Geist 600 en `#f7f6f3` y círculo `#a8285a` (brandkit sección 2) |
| Íconos `lucide-react` | `House`, `ChartColumn`, `Settings`, `ChevronLeft`, `ChevronRight`, `Search`, `Plus`, `Minus`, `Play`, `Pause`, `ExternalLink`, `ArrowRight`, `Check`, `Share`, `SquarePlus` | `House`, `ChartBar`, `GearSix`, `CaretLeft`, `CaretRight`, `MagnifyingGlass`, `Plus`, `Minus`, `Play` (fill), `Pause` (fill), `ArrowUpRight`, `ArrowRight`, `Check`, `Export`, `PlusSquare`, más los nuevos del brandkit sección 7 |

## 8. Tests acoplados (revisar en la misma rama)

- `tests/unit/manifest.test.ts` compara contra `COLOR_DE_FONDO`: pasa solo si se cambia la constante,
  no el literal.
- `tests/unit/ui-pildora-pilar.test.tsx`: la píldora de pilar pasa a palabra; el test se reescribe.
- `tests/unit/deslizar-aprobar.test.tsx`, `tests/e2e/guion.spec.ts` y `tests/e2e/video.spec.ts`
  buscan `getByRole("slider", { name: … })` y lo mueven con el teclado. El deslizador nuevo
  conserva `role="slider"`, el nombre, `aria-valuenow` y `aria-valuetext`, y se mueve con flechas,
  Inicio y Fin. Cambio de comportamiento a cubrir con un test nuevo: **tocar la pista no aprueba**
  y se aprueba al soltar en el tope (hoy `alMover` aprueba al cruzar 96).
- El test unitario usa la etiqueta «Desliza para aprobar y grabar», que el código ya no usa
  (`inventario.md` 15.2 punto 7).

## 9. Bloque propuesto para `globals.css`

`tokens.css` entra tal cual (sin el `@font-face`, que lo pone `geist`) y Tailwind lo lee con
`@theme inline`. Los `initial` cierran las paletas por defecto: un `bg-white` o un `rounded-lg`
olvidado deja de compilar a algo y aparece en la revisión.

```css
@import "tailwindcss";
/* :root, dark and reduced-motion blocks from final/tokens.css go here, without @font-face. */

@theme inline {
  --color-*: initial;
  --radius-*: initial;
  --shadow-*: initial;
  --text-*: initial;

  --color-fondo: var(--fondo);
  --color-superficie: var(--superficie);
  --color-tinta: var(--tinta);
  --color-apagado: var(--apagado);
  --color-campo: var(--campo);
  --color-linea: var(--linea);
  --color-pista: var(--pista);
  --color-principal: var(--principal);
  --color-sobre-principal: var(--sobre-principal);
  --color-sobre-tinta: var(--sobre-tinta);
  --color-firma: var(--firma);
  --color-sobre-firma: var(--sobre-firma);
  --color-firma-rastro: var(--firma-rastro);
  --color-error: var(--error);
  --color-exito: var(--exito);
  --color-aviso: var(--aviso);
  --color-velo-video: var(--velo-video);
  --color-sobre-video: var(--sobre-video);
  --color-transparent: transparent;
  --color-current: currentColor;

  --font-sans: var(--font-geist-sans), ui-sans-serif, -apple-system, system-ui, sans-serif;

  --text-pantalla: var(--t-pantalla);
  --text-pantalla--line-height: var(--i-pantalla);
  --text-pantalla--letter-spacing: var(--tr-pantalla);
  --text-pantalla--font-weight: var(--peso-titulo);
  --text-pieza: var(--t-pieza);
  --text-pieza--line-height: var(--i-pieza);
  --text-pieza--letter-spacing: var(--tr-pieza);
  --text-pieza--font-weight: var(--peso-titulo);
  --text-guion: var(--t-guion);
  --text-guion--line-height: var(--i-guion);
  --text-cuerpo: var(--t-cuerpo);
  --text-cuerpo--line-height: var(--i-cuerpo);
  --text-meta: var(--t-meta);
  --text-meta--line-height: var(--i-meta);
  --text-marca: var(--t-marca);
  --text-marca--line-height: var(--i-marca);
  --leading-prosa: var(--i-prosa);

  --radius-12: var(--r-12);

  --shadow-barra: var(--sombra-barra);
  --shadow-flotante: var(--sombra-flotante);

  --ease-salida: var(--curva-salida);
  --ease-vuelta: var(--curva-vuelta);
}
```

Notas: los nombres de `@theme` (`--color-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--ease-*`)
nunca repiten un nombre de `tokens.css`, para que ninguna variable se apunte a sí misma.
`--text-*--font-weight` es soportado por Tailwind v4; si se prefiere no atar el peso al
tamaño, se quita y se pone `font-semibold` en cada título. `rounded-full` sigue existiendo aunque
`--radius-*` vuelva a `initial` (es una utilidad fija). Las sombras y radios con nombre en español
(`--sombra-*`, `--r-12`) quedan en `:root` para el CSS propio (barra, toast, deslizador).

## 10. Orden sugerido de migración

Cada paso con su test primero (regla TDD del proyecto) y la suite completa al final de cada uno.

1. **Piel sin tocar la estructura (un commit, reversible).** Entran los tokens nuevos y Geist, y los
   nombres viejos quedan como alias de transición: `--acento: var(--tinta)`,
   `--acento-profundo: var(--tinta)`, `--acento-suave: var(--pista)`,
   `--acento-claro: var(--sobre-tinta)`, `--sobre-acento: var(--sobre-principal)`,
   `--hundido: var(--pista)`, `--ok-tinta: var(--exito)`, `--aviso-tinta: var(--aviso)`,
   `--error-tinta: var(--error)`, los tres `*-fondo` en `var(--fondo)`, los derivados de pilar en
   neutros (`--p-tinte: var(--fondo)`, `--p-tinte-fuerte: var(--pista)`, `--p-tinta` y `--p-punto`
   en `var(--apagado)`), `--font-serif` en Geist y los radios 14, 20 y 24 en 12. El pulgar de
   `.deslizador` pasa a `var(--firma)` a mano. Resultado: la app entera en piedra, tinta y Geist,
   con la frambuesa solo al firmar.
2. **Los tres críticos de la síntesis**, en este orden: el deslizador nuevo (tocar no aprueba), el
   reproductor de video al alto disponible con el play visible, y las confirmaciones destructivas.
3. **Componentes por sección del brandkit**: línea de estado (reemplaza `Nota`), barra de firma,
   botones, campos y editor con fichas, filas, navegación, toast, Ideas, Calendario, Métricas y
   Ajustes. Cada componente deja de usar los alias.
4. **Cierre:** borrar los alias, los `[data-pilar]`, `.deslizador` y `lucide-react`, y comprobar
   con `grep` que no quedan `acento`, `hundido`, `-fondo`, `pilar-`, `font-serif` ni
   `text-display`. Recién ahí se activan los `initial` del bloque de la sección 9.
