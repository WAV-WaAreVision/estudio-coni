---
name: Conidolly
description: App donde Coni del Rosario firma, en su iPhone, las ideas, guiones, voces y videos de su avatar para LinkedIn.
colors:
  piedra: "#ebebea"
  piedra-alta: "#f4f4f3"
  piedra-honda: "#dcdcdb"
  luz: "#fbfbfa"
  tinta: "#262626"
  apagado: "#5a5a59"
  campo: "#727271"
  error-tinta: "#b5137a"
  firma: "#a8285a"
  sobre-firma: "#fbfbfa"
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
    fontSize: "1.18rem"
    fontWeight: 400
    lineHeight: 1.6
  cuerpo:
    fontFamily: "Geist, ui-sans-serif, -apple-system, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.333
  meta:
    fontFamily: "Geist, ui-sans-serif, -apple-system, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.333
rounded:
  control: "999px"
  bloque: "18px"
  barra: "28px"
  toast: "22px"
  casilla: "9px"
  video: "22px"
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
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.luz}"
    typography: "{typography.cuerpo}"
    rounded: "{rounded.pildora}"
    height: "3.25rem"
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
    size: "3rem"
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
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.luz}"
    rounded: "{rounded.pildora}"
  segmentado:
    backgroundColor: "{colors.piedra-honda}"
    textColor: "{colors.apagado}"
    rounded: "{rounded.pildora}"
    height: "52px"
  aviso-exito:
    backgroundColor: "{colors.piedra-honda}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pildora}"
    padding: "14px 20px"
  aviso-advertencia:
    backgroundColor: "{colors.piedra-honda}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pildora}"
    padding: "14px 20px"
  aviso-error:
    backgroundColor: "{colors.piedra-honda}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pildora}"
    padding: "14px 20px"
  panel:
    backgroundColor: "{colors.piedra-alta}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.panel}"
    padding: "20px"
---

<!-- Palette: gris neutro, chosen by Federico on 2026-10-16 (monochrome, dark primary, no yellow; raspberry only signs). Mockups: conidolly-rediseno/soft-ui/v6.
     Target system, approved by Federico on 2026-10-15 ("Adoptar soft UI completo", mint + raspberry signature).
     The code runs it since docs/superpowers/plans/2026-10-16-soft-ui.md; app/globals.css is the source of the values. -->

# Design System: Conidolly

## 1. Overview

**Creative North Star: "La firma sobre piedra"**

Una piedra tibia y blanda, tallada en relieve suave, donde lo único de color fuerte es la firma de
Coni. Cada control es un objeto: sobresale del fondo con una luz arriba a la izquierda y una sombra
abajo a la derecha, y se hunde cuando ella lo toca. La tinta marca la acción principal y lo que se
puede hacer; la frambuesa queda reservada para el acto de firmar.

La app es suave al tacto y seria al leer. La forma es blanda; el texto no. Tinta casi negra sobre
piedra, 17 px de base (el cuerpo de iOS en el iPhone), una sola decisión por pantalla. Rechaza el dashboard SaaS (números gigantes,
gráficos decorativos), la herramienta de IA (destellos, degradados morados, neón), el influencer de
LinkedIn (emojis en serie, ganchos) y la app de bienestar con texto pastel sobre pastel.

Movimiento responsivo, sin coreografía: el relieve se hunde en 150 ms al tocar y vuelve con
`cubic-bezier(0.23, 1, 0.32, 1)`; los cambios de estado duran 200 ms; con reducir movimiento, todo
es instantáneo. Columna de lectura de 560 px como máximo en tablet y computador.

**Key Characteristics:**
- Fondo y superficies del mismo color piedra; la profundidad sale de la doble sombra, no de bordes.
- Formas de píldora para todo lo que se toca; paneles de 24 px para lo que se lee.
- Tinta para la acción principal; magenta solo para errores; frambuesa solo para firmar.
- Estados con fondo de color y su texto, siempre con ícono.
- Una sola familia (Geist), cinco tamaños en `rem`.

## 2. Colors

Gris neutro casi monocromo, con una sola nota de color: la frambuesa que firma.

### Primary
- **Tinta** (#262626): el botón principal (relleno, con texto luz 14,6:1), los estados activos, el progreso de la voz y las casillas marcadas. Es también el color de todo el texto (12,7:1 sobre piedra).

### Secondary
- **Frambuesa de firma** (#a8285a): solo el pulgar del deslizador de firma y su rastro. Es el mismo valor del logo, el ícono y `/l` (4,91:1 sobre honda; texto luz encima 6,51:1).

### Neutral
- **Piedra** (#ebebea): fondo de página y de todo lo que está en relieve.
- **Piedra alta** (#f4f4f3): paneles de lectura y grupos planos.
- **Piedra honda** (#dcdcdb): lo hundido (pistas, campos, segmentados, deshabilitados) y las píldoras de estado y de aviso, siempre con ícono y texto tinta (11,0:1).
- **Luz** (#fbfbfa): el lado iluminado de la doble sombra y el texto sobre tinta o frambuesa.
- **Apagado** (#5a5a59): meta, ayuda, pilares (5,79:1 sobre piedra; 5,03:1 sobre honda).
- **Campo** (#727271): anillo de casillas vacías y contornos de alto contraste (4,04:1 sobre piedra; 3,51:1 sobre honda).
- **Magenta fresa de error** (#b5137a): mensajes de error y acciones destructivas, siempre con ícono (5,27:1 sobre piedra; 4,58:1 sobre honda). Es distinta de la frambuesa de firma a propósito.

### Named Rules
**The One Signature Rule.** La frambuesa aparece solo donde Coni firma. Si un elemento frambuesa no aprueba nada, está mal.

**The No Yellow Rule.** Avisos y advertencias van en píldoras grises con ícono; el color no es la señal.

**The Relief Is Not A Boundary Rule.** El relieve es decorativo. Lo que identifica un control es su forma, su texto o su ícono, y en modo de alto contraste lleva contorno `campo`.

## 3. Typography

**Display Font:** Geist (con -apple-system, system-ui)
**Body Font:** Geist

**Character:** una grotesca neutra y precisa que equilibra lo blando de las formas; el rigor lo pone
la letra.

### Hierarchy
- **Pantalla** (600, 2rem, 1,125): el título de cada pantalla, la respuesta de la pantalla.
- **Pieza** (600, 1,5rem, 1,167): título de pieza, gancho de idea, monto del costo.
- **Guion** (400, 1,25rem, 1,6): el guion y el texto de LinkedIn, en columna de 65 caracteres.
- **Cuerpo** (400, 1rem sobre el cuerpo de iOS, 1,333): base de accesibilidad; filas y botones en 600.
- **Meta** (500, 0,9375rem, 1,333): meta, rótulos de sección, ayuda, cifras con `tabular-nums`.

### Named Rules
**The Sentence Case Rule.** Rótulos en oración normal ("Necesita tu firma"); nunca mayúsculas con
espaciado sobre un título.

## 4. Elevation

Sistema de relieve suave (soft UI): las superficies son del mismo color del fondo y se separan con
una doble sombra, luz arriba a la izquierda y sombra abajo a la derecha. Tres niveles, nunca más.

### Shadow Vocabulary
- **Relieve** (`box-shadow: -6px -6px 14px rgb(251 251 250 / 0.9), 6px 6px 14px rgb(60 60 60 / 0.18)`):
  botones, chips, campos de búsqueda en reposo, paneles.
- **Relieve alto** (`box-shadow: -10px -10px 24px rgb(251 251 250 / 0.9), 10px 10px 24px rgb(60 60 60 / 0.22)`):
  la barra de firma, el aviso flotante y la carta de idea. Uno por pantalla.
- **Hundido** (`box-shadow: inset 4px 4px 10px rgb(60 60 60 / 0.18), inset -4px -4px 10px rgb(251 251 250 / 0.9)`):
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
- **Principal:** relleno tinta, texto luz en 600, con relieve. Uno por pantalla.
- **Presionado:** hundido, sin cambio de tamaño.
- **Secundario:** piedra en relieve, texto tinta.
- **Deshabilitado:** piedra honda, plano y sin relieve, texto apagado; debajo, una línea que dice qué
  falta.

### Deslizar para aprobar (signature)
Pista hundida de 3,5rem en piedra honda; pulgar de 3rem en frambuesa con relieve. Al arrastrar deja un rastro frambuesa al 14 %; firma al 96 % y vuelve a cero si se suelta antes. Un toque arma la pista («Toca otra vez para firmar») y otro toque, entre 400 ms y 4 s después, firma; con teclado firman Enter, Espacio y Fin (WCAG 2.5.7, sin botón aparte). Bajo la pista abierta, en reposo, una línea meta apagada lo dice a la vista: «o toca dos veces», y «o pulsa Enter» mientras la pista tiene el foco del teclado (anillo de tinta de 3 px); armada, la línea se vuelve invisible sin perder su alto para que la pista no se mueva entre los dos toques. Con letra grande el pulgar y la pista mantienen su tamaño, la etiqueta en reposo se acorta a «Firmar», un verbo entero, para quedar en una línea (el nombre accesible sigue siendo «Desliza para firmar») y la barra pasa al final de la página.

### Barra de lote
Barra en piedra con relieve alto y radio `panel`, que flota 8 px sobre la barra inferior mientras la lista se mueve
(en computador, abajo a 16 px; con letra grande, al final del contenido). Solo aparece con algo elegido: arriba cuántas
van («2 elegidas»), la acción principal («Hacer los guiones (N)») y la secundaria callada («Descartar (N)»), que abre
sus motivos en línea. Si el tope alcanza para menos, la barra pregunta antes de hacer nada. El toast de esa pantalla
va arriba para no taparla.

### Chips
- **Style:** píldora de 44 px en piedra con relieve; elegido en tinta con texto luz y check.
- **State:** deshabilitado plano en piedra honda.

### Cards / Containers
- **Corner Style:** 24 px.
- **Background:** piedra alta para paneles de lectura; piedra para la carta de idea.
- **Shadow Strategy:** planos los paneles de lectura (guion, texto de LinkedIn, respaldo); en
  relieve solo si el panel entero se toca (lista de piezas) y en relieve alto la carta de idea.
- **Border:** ninguno.
- **Internal Padding:** 20 px. Nunca una caja dentro de otra.
- **Carta de idea:** pilar con su nombre corto, gancho, formato y «Respaldo débil» si aplica; nunca la
  «fuerza» del motor ni el tema suelto. A lo más dos acciones a la vista («Usar esta» y «Después»); el
  resto («Descartar», «Escribir una idea mía») va plegado bajo «Más».
- **Nombre del pilar:** el corto en lo compacto (chips, filas, cabeceras de carta y de puerta, celdas);
  el completo solo en títulos a todo el ancho y en frases.

### Inputs / Fields
- **Style:** píldora hundida en piedra honda, 52 px; las áreas de texto usan 24 px de radio y crecen
  con su contenido. Lo que se lee con forma de campo (los espacios del ritmo) usa el mismo hundido en
  honda, nunca una línea suelta debajo.
- **Focus:** anillo de 2 px en tinta, separado 2 px del campo.
- **Error:** contorno de 2 px en tinta de error, mensaje debajo con ícono.

### Navigation
Barra inferior de tres pestañas sobre piedra con relieve alto hacia arriba. La activa va en una
píldora hundida en piedra honda, en texto tinta 600; las demás, en apagado. En computador sube al borde
superior. Con letra grande queda al final del contenido en una sola fila compacta: ícono arriba y etiqueta
corta debajo, achicada al tamaño de cuerpo normal para que las tres quepan, cada pestaña de 44 px o más.

### Avisos y estados
Planos, sin sombra: píldoras de 32 px en piedra honda, ícono a la izquierda y
texto en su tinta (con letra grande, si el texto se parte, el radio pasa a `bloque`, 18 px). Nunca con el relieve ni el peso de un botón. Las casillas vacías llevan anillo
`campo` (3,01:1) sobre cualquier fondo. Con `prefers-contrast: more`, todo control suma contorno
`campo`. El toast flota en tinta sobre piedra, 8 s, con "Deshacer" después de firmar o gastar.

### Pestañas
Control segmentado: pista hundida en piedra honda y la opción activa en piedra con relieve.

### Filas de elección
Radio redondo hundido con anillo `campo`; el elegido en tinta con punto luz. Las filas no elegidas
bajan a 500 y siguen en tinta: son opciones, nunca algo cerrado.

### Confirmaciones
En línea, bajo el botón que las pidió (descartar, pedir cambios, regrabar, desconectar, cerrar
sesión): la pregunta, la acción y «Volver». Nunca un diálogo.

### Detalle para WAV
Lo que Coni lee va en sus palabras. El proveedor, los saldos, las llaves y el enlace al proveedor van
plegados bajo «Detalle para WAV», uno por bloque. En Ajustes, el tope de gasto, las cuentas, las llaves,
los saldos y Claude viven solo en la sección plegada «Para WAV». La lista de configuración de Coni nombra
solo lo que ella hace: tu voz, tu avatar, Instagram, LinkedIn (opcional, «A mano», fuera de la cuenta) y
los avisos del celular; nunca un proveedor.

### Puertas
- **Puerta 1:** tres pasos en orden: «1. Escucha tu voz», «2. Revisa el guion», «3. Elige tu avatar»
  (requisito para firmar, nunca plegado). Si el saldo o el tope de gasto no alcanzan, el motivo va
  arriba, antes del paso 1, y otra vez junto a la firma. Si una falla solo la arregla Federico, el
  texto lo dice primero y reintentar queda como botón secundario.
- **Puerta 2:** el video 9:16 al ancho de la columna (sin achicarse con letra grande), con «Míralo
  completo para poder firmar» sobre el cuadro hasta que ella lo inicia. Con LinkedIn entre los
  destinos, su texto va primero y el de Instagram se pliega debajo.

## 6. Do's and Don'ts

### Do:
- **Do** usar la misma piedra (#ebebea) en fondo y superficies; separar con relieve, no con bordes.
- **Do** dejar la frambuesa (#a8285a) solo para firmar: pulgar y rastro.
- **Do** poner texto tinta sobre piedra honda en estados y avisos, y un ícono en cada estado.
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
- **Don't** usar `#fff` ni `#000`: la luz es #fbfbfa y la tinta #262626.
