---
name: Conidolly
description: App donde Coni del Rosario firma, en su iPhone, las ideas, guiones, voces y videos de su avatar para LinkedIn.
colors:
  piedra: "#ecebe6"
  piedra-alta: "#f5f4f0"
  piedra-honda: "#dcdad4"
  luz: "#fbfaf7"
  tinta: "#2a2925"
  apagado: "#5c5a54"
  campo: "#8a877f"
  menta: "#bfe8d0"
  menta-tinta: "#1d6b47"
  menta-foco: "#1f8a5a"
  aviso: "#f3e08e"
  aviso-tinta: "#5a4300"
  error: "#f2aaa6"
  error-tinta: "#7a1f1d"
  firma: "#a8285a"
  sobre-firma: "#fbfaf7"
typography:
  pantalla:
    fontFamily: "Geist, ui-sans-serif, -apple-system, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.125
    letterSpacing: "-0.022em"
  pieza:
    fontFamily: "Geist, ui-sans-serif, -apple-system, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.167
    letterSpacing: "-0.014em"
  guion:
    fontFamily: "Geist, ui-sans-serif, -apple-system, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.6
  cuerpo:
    fontFamily: "Geist, ui-sans-serif, -apple-system, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.333
  meta:
    fontFamily: "Geist, ui-sans-serif, -apple-system, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.333
rounded:
  control: "16px"
  panel: "24px"
  pildora: "999px"
spacing:
  e-1: "4px"
  e-2: "8px"
  e-3: "12px"
  e-4: "16px"
  e-6: "24px"
  e-8: "32px"
  e-10: "40px"
  margen: "20px"
components:
  boton-principal:
    backgroundColor: "{colors.menta}"
    textColor: "{colors.tinta}"
    typography: "{typography.cuerpo}"
    rounded: "{rounded.pildora}"
    height: "52px"
    padding: "0 24px"
  boton-principal-deshabilitado:
    backgroundColor: "{colors.piedra-honda}"
    textColor: "{colors.apagado}"
    rounded: "{rounded.pildora}"
    height: "52px"
  boton-secundario:
    backgroundColor: "{colors.piedra}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pildora}"
    height: "52px"
  deslizar-para-aprobar:
    backgroundColor: "{colors.piedra-honda}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pildora}"
    height: "56px"
  pulgar-firma:
    backgroundColor: "{colors.firma}"
    textColor: "{colors.sobre-firma}"
    rounded: "{rounded.pildora}"
    size: "48px"
  campo:
    backgroundColor: "{colors.piedra}"
    textColor: "{colors.tinta}"
    typography: "{typography.cuerpo}"
    rounded: "{rounded.pildora}"
    height: "52px"
    padding: "0 20px"
  chip:
    backgroundColor: "{colors.piedra}"
    textColor: "{colors.tinta}"
    typography: "{typography.meta}"
    rounded: "{rounded.pildora}"
    height: "44px"
    padding: "0 16px"
  chip-elegido:
    backgroundColor: "{colors.menta}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pildora}"
  segmentado:
    backgroundColor: "{colors.piedra-honda}"
    textColor: "{colors.apagado}"
    rounded: "{rounded.pildora}"
    height: "52px"
  aviso-exito:
    backgroundColor: "{colors.menta}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pildora}"
    padding: "14px 20px"
  aviso-advertencia:
    backgroundColor: "{colors.aviso}"
    textColor: "{colors.aviso-tinta}"
    rounded: "{rounded.pildora}"
    padding: "14px 20px"
  aviso-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.error-tinta}"
    rounded: "{rounded.pildora}"
    padding: "14px 20px"
  panel:
    backgroundColor: "{colors.piedra-alta}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.panel}"
    padding: "20px"
---

<!-- Target system, approved by Federico on 2026-10-15 ("Adoptar soft UI completo", mint + raspberry signature).
     The code still runs Calma suiza (app/globals.css); migrating it needs mockups, a spec and a plan.
     Re-run /impeccable document once the migration lands. -->

# Design System: Conidolly

## 1. Overview

**Creative North Star: "La firma sobre piedra"**

Una piedra tibia y blanda, tallada en relieve suave, donde lo único de color fuerte es la firma de
Coni. Cada control es un objeto: sobresale del fondo con una luz arriba a la izquierda y una sombra
abajo a la derecha, y se hunde cuando ella lo toca. La menta acompaña lo que está bien o lo que se
puede hacer; la frambuesa queda reservada para el acto de firmar.

La app es suave al tacto y seria al leer. La forma es blanda; el texto no. Tinta casi negra sobre
piedra, 18 px de base, una sola decisión por pantalla. Rechaza el dashboard SaaS (números gigantes,
gráficos decorativos), la herramienta de IA (destellos, degradados morados, neón), el influencer de
LinkedIn (emojis en serie, ganchos) y la app de bienestar con texto pastel sobre pastel.

Movimiento responsivo, sin coreografía: el relieve se hunde en 150 ms al tocar y vuelve con
`cubic-bezier(0.23, 1, 0.32, 1)`; los cambios de estado duran 200 ms; con reducir movimiento, todo
es instantáneo. Columna de lectura de 560 px como máximo en tablet y computador.

**Key Characteristics:**
- Fondo y superficies del mismo color piedra; la profundidad sale de la doble sombra, no de bordes.
- Formas de píldora para todo lo que se toca; paneles de 24 px para lo que se lee.
- Menta para acciones y éxito; frambuesa solo para firmar.
- Estados con fondo de color y su texto, siempre con ícono.
- Una sola familia (Geist), cinco tamaños en `rem`.

## 2. Colors

Piedra cálida casi monocroma, con una menta suave para la acción y una frambuesa que firma.

### Primary
- **Menta de consulta** (#bfe8d0): relleno del botón principal, del chip elegido, de la pestaña
  activa y del aviso de éxito. Siempre con texto en tinta (10,86:1). Contra la piedra el relleno
  solo da 1,12:1, por eso nunca va plano: lleva el relieve completo.
- **Menta honda** (#1d6b47): texto de enlaces y de estados correctos sobre piedra (5,42:1).
- **Menta de foco** (#1f8a5a): anillo de foco y progreso (3,63:1 sobre piedra).

### Secondary
- **Frambuesa de firma** (#a8285a): el pulgar del deslizador de aprobar, su rastro y la fecha que
  compromete. Es el mismo valor del logo, el ícono y `/l` (5,65:1 sobre piedra; texto encima 6,46:1).

### Tertiary
- **Trigo de aviso** (#f3e08e) con tinta (#5a4300, 7,09:1): saldos bajos, gasto sobre el 80 % del
  tope, LinkedIn por vencer.
- **Coral de error** (#f2aaa6) con tinta (#7a1f1d, 5,43:1): errores y acciones destructivas.

### Neutral
- **Piedra** (#ecebe6): fondo de página y de todo lo que está en relieve.
- **Piedra alta** (#f5f4f0): paneles de lectura (guion, texto de LinkedIn).
- **Piedra honda** (#dcdad4): lo que está hundido: pistas, campos, segmentados, deshabilitados.
- **Luz** (#fbfaf7): el lado iluminado de la doble sombra y el texto sobre frambuesa.
- **Tinta** (#2a2925): todo el texto (12,20:1).
- **Apagado** (#5c5a54): meta, ayuda, pilares (5,78:1).
- **Campo** (#8a877f): contornos que deben verse sin relieve, como el foco en modo de alto contraste
  (3,01:1).

### Named Rules
**The One Signature Rule.** La frambuesa aparece solo donde Coni firma. Si un elemento frambuesa no
aprueba nada, está mal.

**The Ink Over Pastel Rule.** Sobre menta, trigo y coral, el texto es siempre su tinta oscura.
Prohibido el texto blanco o pastel sobre un relleno pastel.

**The Relief Is Not A Boundary Rule.** El relieve es decorativo. Lo que identifica un control es su
forma, su texto o su ícono, y en modo de alto contraste lleva contorno `campo`.

## 3. Typography

**Display Font:** Geist (con -apple-system, system-ui)
**Body Font:** Geist

**Character:** una grotesca neutra y precisa que equilibra lo blando de las formas; el rigor lo pone
la letra.

### Hierarchy
- **Pantalla** (600, 2rem, 1,125): el título de cada pantalla, la respuesta de la pantalla.
- **Pieza** (600, 1,5rem, 1,167): título de pieza, gancho de idea, monto del costo.
- **Guion** (400, 1,25rem, 1,6): el guion y el texto de LinkedIn, en columna de 65 caracteres.
- **Cuerpo** (400, 1,125rem, 1,333): base de accesibilidad; filas y botones en 600.
- **Meta** (500, 0,9375rem, 1,333): meta, rótulos de sección, ayuda, cifras con `tabular-nums`.

### Named Rules
**The Sentence Case Rule.** Rótulos en oración normal ("Necesita tu firma"); nunca mayúsculas con
espaciado sobre un título.

## 4. Elevation

Sistema de relieve suave (soft UI): las superficies son del mismo color del fondo y se separan con
una doble sombra, luz arriba a la izquierda y sombra abajo a la derecha. Tres niveles, nunca más.

### Shadow Vocabulary
- **Relieve** (`box-shadow: -6px -6px 14px rgb(251 250 247 / 0.9), 6px 6px 14px rgb(70 64 52 / 0.18)`):
  botones, chips, campos de búsqueda en reposo, paneles.
- **Relieve alto** (`box-shadow: -10px -10px 24px rgb(251 250 247 / 0.9), 10px 10px 24px rgb(70 64 52 / 0.22)`):
  la barra de firma, el aviso flotante y la carta de idea. Uno por pantalla.
- **Hundido** (`box-shadow: inset 4px 4px 10px rgb(70 64 52 / 0.18), inset -4px -4px 10px rgb(251 250 247 / 0.9)`):
  campos, pistas, segmentados y el estado presionado de cualquier botón.

### Named Rules
**The Relief Means Touch Rule.** Solo lo que se toca va en relieve: botones, chips, el pulgar, las
filas que abren algo. Lo que solo se lee va plano (estados, paneles de lectura) y lo que recibe
entrada va hundido (campos, pistas, casillas). Si un estado parece botón, está mal.

**The Press Sinks Rule.** Tocar cambia el relieve por el hundido. Nada se agranda ni rebota.

**The Three Levels Rule.** Hundido, relieve, relieve alto. Si una pantalla necesita un cuarto nivel,
sobra un elemento.

## 5. Components

### Buttons
- **Shape:** píldora completa (999px), 52 px de alto, etiqueta a la izquierda y el ícono a la derecha.
- **Principal:** relleno menta, texto tinta en 600, con relieve. Uno por pantalla.
- **Presionado:** hundido, sin cambio de tamaño.
- **Secundario:** piedra en relieve, texto tinta.
- **Deshabilitado:** piedra honda, plano y sin relieve, texto apagado; debajo, una línea que dice qué
  falta.

### Deslizar para aprobar (signature)
Pista hundida de 56 px en piedra honda; pulgar de 48 px en frambuesa con relieve. Al arrastrar deja un
rastro frambuesa al 14 %; aprueba al 96 % y vuelve a cero si se suelta antes. Siempre va acompañado
del botón "Aprobar" (WCAG 2.5.7).

### Chips
- **Style:** píldora de 44 px en piedra con relieve; elegido en menta con check.
- **State:** deshabilitado plano en piedra honda.

### Cards / Containers
- **Corner Style:** 24 px.
- **Background:** piedra alta para paneles de lectura; piedra para la carta de idea.
- **Shadow Strategy:** planos los paneles de lectura (guion, texto de LinkedIn, respaldo); en
  relieve solo si el panel entero se toca (lista de piezas) y en relieve alto la carta de idea.
- **Border:** ninguno.
- **Internal Padding:** 20 px. Nunca una caja dentro de otra.

### Inputs / Fields
- **Style:** píldora hundida en piedra honda, 52 px; las áreas de texto usan 24 px de radio y crecen
  con su contenido.
- **Focus:** anillo de 2 px en menta de foco, separado 2 px del campo.
- **Error:** contorno de 2 px en tinta de error, mensaje debajo con ícono.

### Navigation
Barra inferior de tres pestañas sobre piedra con relieve alto hacia arriba. La activa va en una
píldora menta con relieve, en texto tinta 600; las demás, en apagado. En computador sube al borde
superior.

### Avisos y estados
Planos, sin sombra: píldoras de 32 px con su relleno (menta, trigo, coral), ícono a la izquierda y
texto en su tinta. Nunca con el relieve ni el peso de un botón. Las casillas vacías llevan anillo
`campo` (3,01:1) sobre cualquier fondo. Con `prefers-contrast: more`, todo control suma contorno
`campo`. El toast flota en tinta sobre piedra, 8 s, con "Deshacer" después de firmar o gastar.

### Pestañas
Control segmentado: pista hundida en piedra honda y la opción activa en menta con relieve.

## 6. Do's and Don'ts

### Do:
- **Do** usar la misma piedra (#ecebe6) en fondo y superficies; separar con relieve, no con bordes.
- **Do** dejar la frambuesa (#a8285a) solo para firmar: pulgar, rastro y fecha comprometida.
- **Do** poner texto tinta sobre menta, trigo y coral, y un ícono en cada estado.
- **Do** mostrar lo aprobado completo y tal como se publicará: video 9:16 y texto de LinkedIn con el
  aviso de avatar.
- **Do** respetar el tamaño de texto del sistema y reducir movimiento.

### Don't:
- **Don't** usar tarjetas con números gigantes, gráficos decorativos ni sensación de oficina
  (dashboard SaaS).
- **Don't** usar destellos, degradados morados, brillos neón ni íconos de "magia" (herramienta de IA).
- **Don't** poner emojis en serie ni ganchos de clickbait (influencer de LinkedIn).
- **Don't** poner texto pastel o blanco sobre un relleno pastel (app de bienestar genérica).
- **Don't** apilar más de tres niveles de relieve ni anidar paneles.
- **Don't** usar bordes laterales de color, texto con degradado ni glassmorphism.
- **Don't** usar `#fff` ni `#000`: la luz es #fbfaf7 y la tinta #2a2925.
