---
name: Estudio de Coni
description: App móvil donde Coni del Rosario aprueba y publica el contenido de su avatar digital.
colors:
  bg: "#fbf6f8"
  surface: "#fffcfd"
  sunken: "#f5ecf0"
  ink: "#2b1830"
  muted: "#6f5d74"
  line: "#eadde4"
  accent: "#b3285f"
  accent-deep: "#8e1d4a"
  accent-soft: "#f6e3ec"
  on-accent: "#fff7fa"
  ok-ink: "#1d6743"
  ok-bg: "#e5f3ea"
  warn-ink: "#7a4b00"
  warn-bg: "#fdf1dc"
  err-ink: "#a12a2a"
  err-bg: "#fbe8e6"
  pillar-pareja: "oklch(0.62 0.12 245)"
  pillar-deseo: "oklch(0.62 0.12 320)"
  pillar-autoestima: "oklch(0.62 0.12 50)"
  pillar-limites: "oklch(0.62 0.12 160)"
  pillar-bienestar: "oklch(0.62 0.12 85)"
typography:
  display:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.12
  title:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.15
  script:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
  meta:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "12px"
  md: "14px"
  lg: "20px"
  xl: "24px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "52px"
  button-primary-disabled:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    height: "52px"
  slide-approve:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    height: "60px"
  pillar-pill:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  review-flag:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.md}"
    padding: "14px"
  segmented:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    height: "52px"
  otp-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  status-block:
    rounded: "{rounded.lg}"
    padding: "18px"
  idea-card:
    typography: "{typography.display}"
    rounded: "{rounded.xl}"
    padding: "22px 20px"
  metric-bar:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.pill}"
    height: "10px"
  public-page:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
---

<!-- Tokens taken from the approved proposals pages (docs/designs/estudio-coni-propuestas.html and estudio-coni-propuestas-2.html, directions marked "Elegida"). Re-run /impeccable document once there's code. -->

# Design System: Estudio de Coni

## 1. Overview

**Creative North Star: "La consulta en el bolsillo".** Una herramienta cálida, clara y profesional
que desaparece en la tarea, como Things 3 o Notas de Apple, con la lectura cómoda de Substack
cuando Coni revisa su guion. Tema claro con neutros entibiados hacia el ciruela de su marca.
Movimiento responsivo: respuesta al toque y transiciones de 150 a 250 ms, sin coreografías. No debe
parecer un dashboard SaaS ni una herramienta de IA.

Dirección aprobada: Inicio en lista serena (sin tarjetas); Guion como una carta sobre el tinte del
pilar, con franja del pilar arriba y la línea "Si lo apruebas hoy, sale el …"; Video con el
reproductor 9:16 a sangre completa y el panel de revisión que aparece al terminar de verlo. Las dos
puertas se aprueban deslizando.

## 2. Colors

**The Pillar Palette Rule.** Cinco roles, uno por pilar, todos derivados del mismo tono con
`oklch()`: tinte `oklch(0.955 0.028 H)`, tinte fuerte `oklch(0.91 0.05 H)`, texto `oklch(0.43 0.09 H)`
y punto `oklch(0.62 0.12 H)`, con H = 245 (Pareja y conversación), 320 (Deseo y sexualidad), 50
(Autoestima), 160 (Género y límites) y 85 (Bienestar emocional). Cada color siempre va con el nombre
del pilar: nunca es la única señal. No se usan para acciones ni para decorar.

**The One Action Color Rule.** El frambuesa (`{colors.accent}`) es el único color de acción:
aprobar, estado actual, navegación activa y enlaces. Nada más es frambuesa.

**Semantic Rule.** Éxito, advertencia y error tienen sus pares de tinta y fondo
(`{colors.ok-ink}`/`{colors.ok-bg}`, `{colors.warn-ink}`/`{colors.warn-bg}`,
`{colors.err-ink}`/`{colors.err-bg}`) y siempre llevan texto. Ningún neutro es `#fff` ni `#000`.
Contraste verificado (WCAG 2.x): texto/fondo 15,4:1, apagado/fondo 5,6:1, frambuesa/fondo 5,8:1,
texto sobre frambuesa 5,9:1, pares de estado entre 6,0:1 y 6,6:1.

**Excepción de `/l`.** La página pública usa el registro de marca: el frambuesa es la superficie
completa (`{components.public-page}`). Ahí el texto va en `{colors.on-accent}` sin transparencias,
porque cualquier opacidad baja la letra chica de 4,5:1. Dentro de la app la regla de un solo color
de acción no cambia.

## 3. Typography

Young Serif para títulos de pantalla, títulos de piezas y el texto del guion (la voz de Coni).
Hanken Grotesk para todo lo demás. La serif nunca va en botones, etiquetas, datos ni navegación
(decisión explícita de Federico, 30-09-2026, sobre su regla general de no usar serif en paneles).
Texto base de 18 px; escala de producto: 15 / 18 / 20 / 24 / 30 px. Encabezados de sección en
oración normal ("Necesita tu firma"), nunca rótulos en mayúsculas sobre el título.

## 4. Elevation

Plano por defecto. La jerarquía sale de tipografía, espacio y tintes de fondo. Solo flotan la barra
fija de aprobar, el panel posterior del video y los avisos: sombra con desplazamiento vertical y
desenfoque suave, nunca halos.

## 5. Components

- **Botón principal:** `{components.button-primary}`, 52 px de alto, se achica a 0,97 al tocar.
  Deshabilitado: `{components.button-primary-disabled}` con una línea que dice qué falta.
- **Deslizar para aprobar:** `{components.slide-approve}`, control nativo de rango con pulgar de
  52 px; aprueba al llegar al 96 %, vuelve a cero al soltar antes. Anuncia "Desliza para aprobar y
  grabar" o "Desliza para aprobar video y fecha". Deshabilitado hasta cumplir lo que pide la puerta.
- **Fila de lista:** punto del pilar, título 18 px semibold, línea de meta 15 px, chevron; separador
  de 1 px; altura mínima 64 px; toda la fila es el objetivo táctil.
- **Píldora de pilar:** `{components.pillar-pill}` con el tinte y la tinta del pilar.
- **Marca de revisión:** `{components.review-flag}` con la frase marcada y la casilla "Lo revisé y
  está bien".
- **Reproductor 9:16:** a sangre completa, con etiqueta "Avatar IA", subtítulos al 70 % del alto y el
  conmutador "Ver zonas de Instagram".
- **Aviso (toast):** fondo tinta, 4,5 s, con "Deshacer" cuando aplica.
- **Control segmentado:** `{components.segmented}`; opción activa en `{colors.surface}` con sombra
  mínima. Se usa para la meta en Ajustes y las vistas Mes, Agenda y Ritmo del Calendario.
- **Casillas de código:** seis `{components.otp-cell}` con teclado numérico; la primera lleva
  `autocomplete="one-time-code"` y pegar el código entero llena las seis.
- **Bloque de estado (Ajustes):** `{components.status-block}` arriba de Ajustes con tres estados:
  configurando (lista de cinco pasos, sin caja anidada), todo bien (`{colors.ok-bg}`) y algo vence
  (`{colors.warn-bg}`) con una sola acción.
- **Carta de idea:** `{components.idea-card}` sobre el tinte del pilar, con "Después" y "Usar esta"
  como botones (nunca solo deslizar) y "Buscar" arriba para ir a una idea en particular.
- **Barra de métrica:** `{components.metric-bar}` en el color del pilar, escalada al máximo visible,
  siempre con el número, la base ("cada 1.000") y el nombre del pilar al lado.
- **Grilla del mes:** un punto del pilar por publicación; hoy en `{colors.accent-soft}`.
- **Fila de horario:** libre con borde punteado ("Libre · elige una idea", toca para elegir);
  ocupada con el tinte del pilar y su estado ("Falta tu firma", "Programado").

## 6. Do's and Don'ts

**Do:**
- Mostrar lo aprobado completo y tal como se publicará (video 9:16, texto con aviso de avatar).
- Respetar el tamaño de texto del sistema y reducir movimiento cuando el iPhone lo pide.
- Dejar la serif para títulos y el guion de Coni.
- Mantener un solo gesto de aprobación (deslizar) en las dos puertas.
- Poner el tamaño de la muestra junto a cualquier orden o comparación ("llevas 4 de 8").

**Don't:**
- Tarjetas con números gigantes, gráficos decorativos ni sensación de oficina (dashboard SaaS).
- Destellos, degradados morados, brillos ni íconos de "magia" (herramienta de IA).
- Neumorfismo ni relieves suaves: no alcanzan contraste con letra grande.
- Bordes laterales de color, texto con degradado, glassmorphism decorativo.
- Rótulos en mayúsculas con espaciado sobre los títulos.
- Emojis como íconos.
