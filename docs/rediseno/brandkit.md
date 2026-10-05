# Conidolly · sistema de diseño final («Calma suiza»)

> Sistema visual con el que se hacen los mockups finales de todas las pantallas y, después, la
> implementación. Solo diseño: no toca el código de `estudio-coni`.
> Archivos: `tokens.css` (todos los valores, claro y oscuro), `mapeo-tokens.md` (de `app/globals.css`
> a este sistema), `fonts/Geist-Variable.woff2` y `img/look-*.jpg` (fotogramas reales de los looks).
> Fuentes: `../direcciones/d1-swiss-calma/` (base), `../direcciones/d2` a `d6` (injertos), los
> veredictos de los tres jueces, `../auditoria/sintesis.md` (brief y no negociables) e
> `../inventario.md` (copy y datos). 4 de octubre de 2026.
> Todo texto entre «» es copy real de la app. Lo que no lo es se marca como **copy nuevo**.

---

## 0. Decisión

**Base: d1 «Calma suiza»** (23,6 puntos, primera en la suma de los tres jueces). Tiene la estructura
más legible y la más fácil de construir: una regla de tinta abre cada sección, un segundo eje de
cifras a la derecha, sangría fija de ícono, cinco tamaños, dos radios y tokens que ya tienen la
forma de `globals.css`. Sus debilidades eran tres: poca marca, un Inicio que entierra la firma y
detalles fríos (Geist Mono, la rosa apagada distinta de `/l`). Los injertos de abajo atacan
exactamente esas tres.

### 0.1 Injertos (qué entra, de dónde y qué cambia)

| # | Injerto | De | Cambio frente a d1 | Por qué |
|---|---|---|---|---|
| 1 | Frambuesa `#a8285a` | d2, d4 | reemplaza a `#9a3a5c` | Una sola firma en la app, el ícono y `/l`. Sigue en 6,24:1 |
| 2 | Letra en `rem` con interlínea sin unidad | d2 | antes en px | Pasa directo a `--text-*` de Tailwind v4 y crece con el tamaño de letra |
| 3 | Wordmark con el punto de la «i» en frambuesa, ícono de app y `theme-color` por esquema | d4 | d1 no tenía marca | El punto que firma es la marca. Compuesto en Geist, no en Outfit |
| 4 | Anillo de foco doble (fondo + tinta) | d4 | antes contorno de 2 px | Se ve sobre cualquier superficie, también sobre la firma |
| 5 | Monto del costo a 24/600 tabular | d5 | antes 18/600 | Lo más legible antes de gastar, sin sumar un tamaño |
| 6 | Deslizador: rastro al arrastrar, estado aprobado lleno con check, aro deshabilitado en `apagado` | d3, d5, d6 | antes sin rastro ni cierre; aro en `campo` (3,03:1) | Cierre tranquilo de la firma; el aro pasa a 4,79:1 |
| 7 | Estados propios de la barra (confirmación del gasto, deshabilitada con motivo) y 96 px libres al final de la página | d2 | d1 no los mostraba | Los dos momentos de confianza; el toast nunca tapa el último botón |
| 8 | Duraciones en tokens que bajan a 0 con reducir movimiento | d2 | antes por componente | Una sola regla, sin olvidos |
| 9 | Medidor del gasto del mes que pasa a `aviso` desde el 80 % y el vocabulario completo de estados | d5 | d1 no lo tenía | Es un no negociable del brief |
| 10 | Miniatura real del video (48 × 64) en la fila de un video que espera la puerta 2 | d6 | antes solo texto | Reconocerse en la fila da calidez y velocidad |
| 11 | Marcas de tono como fichas calladas al leer y texto plano al editar | d6 (C15) | sale Geist Mono | Una sola familia; el editor no necesita capa ni `contenteditable` |
| 12 | Filas con el valor a la derecha y el selector nativo detrás; «Cuentas conectadas» como nivel propio | d6 | d1 no tenía Ajustes | Ajustes sale casi gratis y se siente de iOS |
| 13 | Reglas de noche: títulos un peso más livianos, principal un paso bajo la tinta, fotos al 94 %, video nunca atenuado | d3 | d1 tenía el oscuro sin esas reglas | De noche no encandila |
| 14 | Barra de 104 px: la segunda oración de la ayuda de aprobar pasa al flujo | juez 3 | antes 124 px | Cumple el tope de 112 px en las dos puertas; solo un saldo o un motivo largo llegan a 124 |

**Ajustes propios** (no los pidió un juez; salen de la autocrítica):
- Inicio: el título queda en dos líneas y «unos 6 min» se pega debajo; los avisos que no apuntan a
  una firma van después de «Necesita tu firma». La regla de la firma pasa de unos 357 px a unos
  240 px del borde superior en 390 × 844.
- El play de la voz va en contorno, no lleno: así la principal es el único botón lleno de la vista.
- El motivo de un deslizador deshabilitado lleva siempre el ícono `info` en tinta (un motivo no es
  un error); los problemas ya están escritos en el flujo con su color.
- Una grabación bloqueada (saldo o tope) no tiene barra: la barra trae el siguiente paso y, con un
  bloqueo, ese paso está fuera de la app.
- `/l` comparte la frambuesa y la letra, pero no el wordmark: es la página pública de Coni y
  «conidolly» es el nombre de la herramienta interna.

### 0.2 Lo que no entra

| Idea | De | Por qué no |
|---|---|---|
| Outfit, piedra salvia, radio 16 | d4 | Registro de app de bienestar; la salvia puede verse verde con True Tone |
| Etiquetas de botón centradas | d4 | Rompe «nada se centra salvo el deslizador» |
| Cabinet Grotesk y la cifra de 72 | d5 | Segunda familia sin `tnum`; la cifra gigante es el cliché de la métrica héroe |
| Satoshi | d2, d5 | Licencia de Fontshare por resolver y su «1» tabular con pie se confunde con una «l» en plata |
| La firma como línea suelta | d2 | Sin pista no hay superficie que pida el gesto; se lee como control roto |
| Celdas agrupadas y control segmentado | d6 | Devuelven las cajas que el brief quita |
| Oscuro como tema principal | d3 | La escena es de día |
| Geist Mono | d1 | Suena a herramienta de desarrollo y obliga a una capa en el editor |

---

## 1. Idea

**En una línea:** una grilla estricta en tinta tibia sobre piedra, donde lo único de color es la
firma de Coni.

**Escena física:** Coni, entre un paciente y otro, sentada en su consulta con luz de día (o en el
auto estacionado al mediodía), con el iPhone en una mano y el brillo automático, lee un guion de
120 palabras o ve un video de 50 segundos durante dos o tres minutos y decide sola, en su propio
nombre. Eso pide tema claro, contraste alto, letra que se lea sin zoom y una sola cosa importante
por pantalla. De noche, el iPhone en modo oscuro trae el tema oscuro.

**Lectura de diseño:** herramienta de aprobación móvil para una sola persona no técnica, con un
lenguaje suizo y sereno, apoyada en Geist, tokens CSS propios y movimiento mínimo. Diales:
variación 3, movimiento 2, densidad 4. Es producto: la herramienta desaparece detrás de la tarea.

**Qué la hace suiza:**
- Un eje izquierdo que no se mueve (margen de 20). Lo que cuelga, como el punto de no leído, sale
  hacia el margen y nunca empuja el texto.
- **La gramática del par:** texto a la izquierda y cifra a la derecha, en la misma línea base
  («Necesita tu firma» / «2»; «Guion» / «123 palabras · ≈ 52 s · Bien»; «Grabar video» /
  «US$ 1,16»). Todas las cifras forman un segundo eje a la derecha.
- Jerarquía con dos reglas: 1 px en `tinta` abre una sección; 1 px en `linea` separa filas. No hay
  cajas para agrupar.
- **Lleno y vacío:** una marca llena es una barra de 4 px en tinta; una vacía, una línea de 1 px en
  `campo`. Vale para el medidor de gasto, las barras de Métricas, el progreso de reels y el Ritmo.

---

## 2. Marca

**Idea de marca: el punto que firma.** En las pantallas de trabajo hay un solo círculo frambuesa:
el pulgar con el que Coni firma. La marca es ese mismo punto sobre la «i».

- **Wordmark:** `conidolly` en minúsculas, Geist 600, tracking -0,03em, en la `tinta` del tema
  (`#1d1b18` de día, `#ece9e3` de noche). La «i» se compone con la «ı» sin punto (U+0131, está en
  Geist) y un círculo en la `firma` del tema, centrado donde iba el punto, con un diámetro 1,25
  veces el del punto original. Se entrega como SVG con el texto en curvas, en versión de día y de
  noche.
- **Dónde vive:** solo en superficies de marca: Ingreso (arriba, a 20 px de cuerpo), el ícono de la
  app y el manifest. Nunca dentro de una pantalla de trabajo, donde el único círculo frambuesa es el
  pulgar.
- **Tamaño mínimo:** 16 px de cuerpo. **Aire:** una altura de x por lado.
- **Ícono de app:** cuadrado en la tinta del tema claro (`#1d1b18`) con una «c» minúscula de Geist
  600 en `#f7f6f3` y, a su derecha, un círculo `firma` a la altura de la x. iOS redondea las esquinas.
  Reemplaza la «C» sobre frambuesa de hoy. El ícono no cambia con el tema.
- **`theme-color`:** `#f7f6f3` con `(prefers-color-scheme: light)` y `#161513` con `dark`. Manifest:
  `background_color` y `theme_color` en `#f7f6f3`.
- **`/l` (link de la bio, página pública de Coni):** frambuesa `#a8285a` a sangre, incluido el
  overscroll, con texto en `#fcfbf9` (6,52:1) sin transparencias. «Coni del Rosario» en Geist 600 a
  44 (`--t-marca`, el único tamaño fuera de la escala). Sin wordmark de Conidolly. `theme-color`
  `#a8285a`.

---

## 3. Color

Estrategia **contenida**: neutros de piedra tibia (matiz oklch 77 a 91, croma bajo 0,016), tinta y
un solo acento con un solo papel. Ningún `#000` ni `#fff`. Contrastes WCAG 2.x calculados contra
`fondo` salvo que se diga otra cosa.

### 3.1 Claro (principal)

| Token | Valor | Papel | Contraste |
|---|---|---|---|
| `fondo` | `#f7f6f3` | página | |
| `superficie` | `#fcfbf9` | la única superficie elevada, campos | 1,05:1 (siempre con línea o sombra) |
| `tinta` | `#1d1b18` | texto, principal, selección, pestaña activa, foco, reglas, hoy | 15,90:1 |
| `apagado` | `#69645d` | meta, ayuda, pilar, chevrons | 5,43:1 · 4,79:1 sobre `pista` · 5,67:1 sobre `superficie` |
| `campo` | `#8a847b` | contorno de campos, casillas, secundaria, interruptor apagado, marca vacía | 3,43:1 · 3,58:1 sobre `superficie` |
| `linea` | `#e5e2dc` | separador entre filas | 1,20:1 (decorativa) |
| `pista` | `#ebe8e2` | pista del deslizador y del medidor, esqueletos, ficha de marca de tono | 1,13:1 |
| `principal` | = `tinta` | relleno de la principal | |
| `sobre-principal`, `sobre-tinta` | = `superficie` | etiqueta de la principal, texto del toast, check de la casilla | 16,61:1 |
| `firma` | `#a8285a` | **solo** el pulgar y el relleno del deslizador, y la fecha de «sale el …» | 6,24:1 · 5,51:1 sobre `pista` |
| `sobre-firma` | = `superficie` | flecha del pulgar, etiqueta sobre la pista llena | 6,52:1 |
| `firma-rastro` | frambuesa al 14 % | estela detrás del pulgar mientras se arrastra | tinta sobre ella 11,35:1 |
| `error` | `#b3261e` | texto e ícono de error, texto destructivo | 6,05:1 |
| `exito` | `#2e6a44` | texto e ícono de éxito | 5,96:1 |
| `aviso` | `#7d5410` | aviso, bloqueo, gasto desde el 80 % | 6,17:1 |
| `velo-video` | tinta al 64 % | disco del play, rótulo «Avatar IA», degradado bajo los controles | `sobre-video` encima: 5,00:1 aun sobre un cuadro blanco |
| `sobre-video` | `#fcfbf9` | íconos y texto sobre el video | |

La frambuesa tiene 62 % de saturación HSL y ocupa menos del 2 % de cualquier pantalla. Su matiz
(oklch 2) queda a 27° del error (29), y el error nunca rellena: siempre es texto con ícono.

### 3.2 Oscuro (de noche, sigue a iOS)

| Token | Valor | Contraste |
|---|---|---|
| `fondo` | `#161513` | |
| `superficie` | `#1f1d1a` | |
| `tinta` | `#ece9e3` | 15,06:1 |
| `apagado` | `#a39d94` | 6,78:1 · 5,52:1 sobre `pista` |
| `campo` | `#7c766d` | 4,06:1 · 3,30:1 sobre `pista` |
| `linea` | `#2f2c28` | decorativa |
| `pista` | `#2a2724` | |
| `principal` | `#d6d2cb` | un paso bajo la tinta; etiqueta encima 12,11:1 |
| `sobre-principal`, `sobre-tinta`, `sobre-firma` | `#161513` | |
| `firma` | `#d78099` | mismo matiz que de día (oklch 2), croma bajado a 0,11 para que de noche no se lea como rosa luminoso; 6,46:1 · 5,26:1 sobre `pista` |
| `firma-rastro` | frambuesa nocturna al 22 % | tinta sobre ella 8,51:1 |
| `error` · `exito` · `aviso` | `#e98a7f` · `#86c39c` · `#d9ad66` | 7,31 · 8,95 · 8,79:1 |

**Reglas de noche:** los títulos bajan de 600 a 500 (`--peso-titulo`), la principal queda un paso
bajo la tinta para no encandilar, las fotos de los looks van al 94 % de brillo (`--foto-brillo`) y
el video que se firma nunca se atenúa. Error y aviso se distinguen por matiz (27 frente a 78) y
por su ícono, nunca solo por color.

**Cableado:** `@media (prefers-color-scheme: dark)` con la guarda `:root:not([data-theme="light"])`,
y `:root[data-theme="dark"]` para forzarlo. Un solo nombre de atributo en todo el sistema:
`data-theme`.

### 3.3 Reglas

- La frambuesa solo firma: el deslizador de las dos puertas y la fecha que compromete. Botones,
  pestaña activa, selección, hoy, enlaces y foco van en tinta.
- Error, éxito y aviso son tintas de texto e ícono. Nunca pintan una superficie.
- El pilar es una palabra en `apagado`. No tiene color, punto ni fondo (sección 9.11).
- El color nunca es la única señal: todo estado va escrito o con ícono.

---

## 4. Tipografía

- **Geist** (variable, 400 · 500 · 600) para todo, desde el paquete npm `geist` (en producción,
  `next/font/local` o el export de `geist/font/sans`). Verificado con fontTools: trae «», ¿, ¡, ñ,
  tildes, `·`, `•` (el correo enmascarado), `≈` (que el subconjunto de Google Fonts no trae), la «ı»
  del wordmark y `tnum`, con un «1» tabular sin pie.
- Sin serif, sin Inter, sin una segunda familia.
- `font-variant-numeric: tabular-nums` (`--cifras`) en plata, horas, duraciones, saldos, conteos y
  métricas.
- Los tamaños van en `rem` con interlínea sin unidad, para que crezcan con el tamaño de letra.

| Rol | Token | Tamaño / interlínea | Peso | Tracking |
|---|---|---|---|---|
| Título de pantalla (la respuesta de la pantalla) | `pantalla` | 32 / 36 (2rem) | 600 (`--peso-titulo`; 500 de noche) | -0,022em, `text-wrap: balance` |
| Título de pieza, gancho de idea, monto de un costo | `pieza` | 24 / 28 (1,5rem) | 600 | -0,014em, `text-wrap: balance` |
| Guion, al leer y al editar | `guion` | 20 / 32 (1,25rem) | 400 | 0 |
| Cuerpo, filas, botones | `cuerpo` | 18 / 24 en UI · 18 / 28 en prosa (1,125rem) | 400 · 500 · 600 en títulos de fila y botones | 0 |
| Meta, rótulos, ayuda, unidades, marcas de tono | `meta` | 15 / 20 (0,9375rem) | 400 · 500 · 600 en rótulos de sección | 0 |
| Nombre en `/l` (fuera de la app) | `marca` | 44 / 48 | 600 | -0,022em |

En la app solo existen 15, 18, 20, 24 y 32. Toda interlínea es múltiplo de 4. El paso de 18 a 20 no
ordena jerarquía: es el papel del guion (lectura larga). Líneas de lectura de 65 caracteres o menos
(en 390 px se cumple solo; en tablet manda la columna de 560).

---

## 5. Espacio y grilla

- Escala de 4 y 8: 4, 8, 12, 16, 24, 32, 40, 48, 64.
- **Margen lateral de 20.** Columna de 350 en un iPhone de 390; máximo de 560 en tablet o computador.
- **Sangría de ícono de 36** (caja de 24 + 12): todo lo que lleva ícono, casilla o punto alinea su
  texto en x = 56 (líneas de estado, revisión, casillas, motivos, avisos).
- Entre secciones, 40. Dentro de una sección, 8 a 16. Filas de pieza de 64 o más; filas de
  navegación, valor e interruptor de 56.
- **96 px libres** después del último control de toda página (más el alto de la barra o de la
  navegación), para que un toast nunca lo tape.
- Barra de firma: 12 arriba, 8 entre la acción y la línea, 8 abajo más la safe area.

---

## 6. Forma y elevación

- **Dos radios:** 12 px (botones, campos, fotos, video, carta de idea, toast, chips, miniaturas) y
  círculo (deslizador, pulgar, casilla, interruptor, play, puntos, medidores).
- **Una superficie elevada por pantalla, nunca una dentro de otra:** la barra de firma (Guion,
  Video), la carta de idea (Ideas) o el toast. La barra lleva `--sombra-barra` (hacia arriba); la
  carta y el toast, `--sombra-flotante` (hacia abajo). Sombras teñidas de tinta, nunca negras.
- La navegación inferior no se eleva: va sobre el fondo con una línea arriba.
- Los campos tienen borde porque son campos (3:1), no porque agrupen.
- **Foco:** `--anillo-foco` (2 px de fondo y 2 px de tinta por fuera), en todo lo enfocable,
  también sobre el pulgar frambuesa. Solo con `:focus-visible`.

---

## 7. Iconografía

- **Phosphor Regular**, un solo peso. 20 px junto a texto de 18, 16 junto a texto de 15, 24 en la
  navegación y 32 en el momento de cierre. **Bold** solo para el check dentro de una casilla o del
  pulgar; **Fill** solo para play y pausa.
- Solo cuando suma significado. Vocabulario: `caret-left` (volver), `caret-right` (ir),
  `caret-down` (plegar), `caret-up-down` (selector nativo), `check`, `check-circle` (éxito),
  `warning` (aviso), `warning-circle` (error), `info` (motivo), `calendar-blank` (fecha),
  `arrow-right` (pulgar, seguir), `video-camera` (grabar video), `microphone` (grabar voz),
  `arrow-counter-clockwise` (volver a grabar, deshacer), `plus`, `minus`, `magnifying-glass`,
  `arrow-up-right` (ir a Instagram), `wifi-slash` (sin conexión), `play`, `pause`, `house`,
  `chart-bar`, `gear-six`, `export` (el Compartir de iOS) y `plus-square` (instalar en iPhone).
- Reemplaza a Lucide (`@phosphor-icons/react`). Los caracteres «‹» y «↗» del copy de hoy pasan a
  íconos.

---

## 8. Movimiento

- Solo responde al toque y solo sobre `transform` y `opacity`. Nada se anima al cargar.
- `--dur-corta` 150 ms: presionar (`scale(0.98)`), casilla, interruptor.
- `--dur-media` 200 ms: cambio de estado, confirmación en línea (8 px de subida y fundido), toast,
  plegable.
- `--dur-larga` 220 ms: el pulgar vuelve o llega al final; la carta de idea entra.
- Curvas: `--curva-salida` `cubic-bezier(0.23, 1, 0.32, 1)` para entrar y asentarse;
  `--curva-vuelta` `cubic-bezier(0.32, 0.72, 0, 1)` para el pulgar que vuelve. Sin rebote.
- El pulgar sigue al dedo 1 a 1, sin curva.
- "Trabajando" es un punto de 8 px que late en opacidad (1 a 0,25) cada `--latido` (1,6 s). Es un
  estado real, no adorno.
- **Reducir movimiento:** las duraciones bajan a 0 en los tokens, el punto queda quieto, los botones
  no escalan y el pulgar salta. Se conservan los cambios de color y opacidad que explican un estado.
  El gesto de firmar no cambia.

---

## 9. Componentes

### 9.1 Esqueleto de pantalla y de pieza

- **Pantallas con navegación** (Inicio, Ideas, Calendario, Métricas, Ajustes): arriba, el par de 15
  (por ejemplo «Hola, Coni» en 600 / «Semana del 5 al 11 de octubre» en `apagado`); debajo, el
  título de pantalla de 32. Ideas y Calendario llevan «‹ Inicio» (`caret-left` + «Inicio», 18/500,
  objetivo de 44) sobre el par.
- **Pantallas de pieza** (Guion y Video, en todos sus estados), siempre igual:
  1. «‹ Inicio», objetivo de 44.
  2. Par de meta: el pilar a la izquierda / «Mito o realidad · 52 s» a la derecha, en 15 `apagado`.
  3. Título de pieza de 24.
  4. Una **línea de estado** (9.6) con ícono: lo que pasa con la pieza o lo que la firma
     compromete.
  5. El cuerpo, por secciones con rótulo.
  6. La barra (9.13), si hay un siguiente paso posible.
- Cambiar de estado cambia la línea de estado y la acción, nunca el diseño. Hay una sola forma de
  volver: «‹ Inicio» arriba (sale el «Volver a Inicio» de abajo).
- Video es la excepción de orden: el video va primero, bajo «‹ Inicio», y el par, el título y el
  estado van debajo (9.17).

### 9.2 Rótulo de sección

Regla de 1 px en `tinta` a todo el ancho, 12 de aire, etiqueta 15/600 en tinta a la izquierda y, si
existe, la cifra 15 `apagado` tabular a la derecha («2», «3», «123 palabras · ≈ 52 s», «Bien» con
`check` en `exito`). Separación de 40 sobre la regla y de 8 bajo la etiqueta. Reemplaza a las cajas
de sección y a los rótulos apagados de hoy. La etiqueta de un campo es el rótulo de su sección.

### 9.3 Filas

- **Fila de pieza:** pilar (15 `apagado`) arriba, título 18/600 (tracking -0,004em) y estado 15/500
  en tinta abajo; `caret-right` de 20 en `apagado` a la derecha si se toca. Alto mínimo 64, 12 de
  relleno vertical, separador de 1 px en `linea`, sin separador en la última. Repite el esqueleto
  de la pantalla de pieza (meta, título, estado).
- **Miniatura de video:** en la fila de un video que espera la puerta 2 («Necesita tu firma», «Para
  subir»), un cuadro real del render de 48 × 64, radio 12, `object-fit: cover`, entre el texto y el
  chevron (12 de separación). Sin miniatura cuando no hay nada que ver (guion, escribiendo,
  grabando).
- **No leído:** punto de 8 px en `tinta` colgado en el margen (x = 6), a la altura del título, más
  «Sin leer» para lector de pantalla. Es como se muestra un aviso que apunta a una pieza ya listada.
- **Trabajando:** el punto que late antes del estado («Escribiendo el guion · te aviso»,
  «Grabando · unos 5 min · te aviso»). Sin chevron: no se toca. Sin barra esqueleto.
- **Programado:** se puede tocar (lleva a Video, donde se cambia la fecha).
- **Fila de navegación** («Ver calendario», «Ver todas las ideas»): 18/500, alto 56, línea de
  `linea` arriba, `caret-right` a la derecha. Reemplaza los botones sueltos.
- **Fila con valor** (Ajustes, fecha, hora): etiqueta 18/400 en tinta a la izquierda; valor 18 en
  `apagado` a la derecha (tabular si es número u hora) con `caret-up-down` si abre un selector
  nativo o `caret-right` si abre otro nivel. El control nativo (`select`, `input type=time`) cubre
  toda la fila, invisible, para que iOS muestre su propia rueda. Alto 56, separador en `linea`.
- **Fila con interruptor:** etiqueta 18 (y detalle 15 `apagado` si hace falta) a la izquierda,
  interruptor (9.10) a la derecha. Toda la fila es el objetivo.
- **Fila con check** (fecha de publicación, pilar, motivo de descarte, hasta 5 opciones): texto 18 a
  la izquierda, `check` de 20 en tinta a la derecha en la elegida. Con más de 5 opciones, una fila
  con valor y el selector nativo detrás. No hay hojas propias.

### 9.4 Botones (una principal por vista)

| Tipo | Forma | Etiqueta | Cuándo |
|---|---|---|---|
| **Principal** | `principal` lleno, 52 px, radio 12, relleno 0 16, ancho completo (en la barra, comparte la fila con su costo) | 18/600 en `sobre-principal`, **a la izquierda**, y un ícono de 20 a la derecha que dice qué pasa (`arrow-right`, `video-camera`, `microphone`) | Una por vista: «Escribir 3 guiones», «Grabar video», «Mandarme el código» |
| **Secundaria** | contorno de 1 px en `campo` (3:1), sin relleno, 52 px, ancho del contenido | 18/600 en tinta, ícono a la derecha si suma | «Volver a grabar voz», «Después», «Llegó una consulta» (`plus`) |
| **Texto** | sin forma, objetivo de 44 | 18/600 en tinta, ícono adelante si suma | «Volver a revisar el guion», «Cambiar», «Editar el texto» |
| **Destructiva** | sin forma, objetivo de 44, al final del flujo | 18/600 en `error` | «Pedir cambios», «Regrabar», «Descartar esta pieza», «Descartar» |

- Al presionar: `scale(0.98)` en 150 ms. Con puntero (`hover: hover`), la principal baja a 92 % de
  opacidad.
- **Deshabilitada:** la principal pasa a `pista` con etiqueta e ícono en `apagado` (4,79:1); la
  secundaria, a contorno `linea` con etiqueta `apagado`. Sigue enfocable (`aria-disabled`) para que
  el lector lea su motivo, que siempre va escrito al lado.
- **Trabajando:** la etiqueta pasa al gerundio del copy («Guardando…», «Grabando la voz…») y el
  ícono se cambia por el punto que late.
- Lo destructivo nunca va lleno ni en frambuesa, aunque sea la única acción de la pantalla («Para
  subir a mano» incluido).

### 9.5 Confirmación en línea

Reemplaza el contenido de la barra o de la fila donde estaba la acción. Sin caja teñida, sin
diálogo. Entra con 8 px de subida y fundido en 200 ms.

- **Gasto** (en la barra): la frase 18/24 en tinta con el monto en 600 tabular («¿Grabar el video?
  Cuesta unos US$ 1,36.»); debajo, la principal «Sí, grabar» y el texto «Volver». Alto: 12 + 24 + 8
  + 52 + 8 = 104 px. Confirmar un gasto nunca usa la frambuesa.
- **Destructiva** (en el flujo, en lugar del botón destructivo): la frase 18 en tinta («Se escribe un
  guion nuevo y este se descarta. ¿Seguro?»); debajo, una secundaria con contorno de 1 px en
  `error` y etiqueta en `error` («Sí, pedir cambios») y el texto «Volver».
- **Gasta y descarta** («Regrabar»): manda el trato destructivo, con el costo en la frase («Se vuelve
  a grabar con tu avatar y este video se descarta. Regrabar cuesta unos US$ 1,16. ¿Seguro?» +
  «Sí, regrabar» en contorno `error`).
- **Descartar esta pieza** pide confirmación siempre (**copy nuevo por confirmar**, sección 13).
- Lo que se puede deshacer no se confirma: se hace y el toast trae «Deshacer» (descartar una idea).

### 9.6 Línea de estado (reemplaza a la `Nota`)

- Grilla de 24 + 1fr con 12 de separación (el texto cae en x = 56). Ícono de 20 en la tinta del
  estado, centrado en su caja de 24. Primera línea 18/24; detalle 15/20 en tinta; acción opcional
  (botón de texto) alineada al texto.
- **El ícono siempre lleva el color del estado. El texto lo lleva cuando es el estado mismo**
  («Guion aprobado · falta grabar», «Lo viste completo», «Programado para el jueves 8 de octubre ·
  19:00»). Si es un nombre o un mensaje largo, va en tinta y solo su rótulo inicial lleva color
  («Para confirmar:», «Hay que corregirlo:»).
- Sin fondo, sin borde lateral, sin caja. Va donde ocurre: bajo el título de la pieza, bajo el
  campo que falló, arriba de Inicio.
- Tipos: `exito` (`check-circle`), `aviso` (`warning`), `error` (`warning-circle`, con
  `role=alert`), neutro (`info` o `calendar-blank` en tinta).
- **La fecha que compromete:** «Si lo apruebas hoy, sale el **jueves 8 de octubre · 19:00**», con
  `calendar-blank` en tinta y la fecha en `firma` 600 tabular, en su propia línea y sin cortarse
  (`white-space: nowrap`). Es el segundo y último lugar de la frambuesa. Debajo, en 15, la segunda oración de la ayuda de la barra: «Después grabas la voz y el
  video.»
- **Notas de pieza en Inicio** (falla, publicado, subido a mano): una línea de estado por pieza
  arriba de todo, con el título de la pieza en tinta 600, la explicación en 15 y la acción de texto
  («Revisar», «Revisar la frase», «Elegir otra fecha», «Ver en Instagram» con `arrow-up-right`).
- **Sin conexión:** línea a todo el ancho bajo la safe area superior, 44 de alto, `wifi-slash` en
  `aviso` y «Sin conexión. Aprueba cuando vuelva.» en 15/600 tinta, a la izquierda, con una línea de
  `linea` abajo. No pinta fondo.
- **Error de pantalla:** línea de error «No pude cargar esta pantalla.» + detalle «Puede ser la
  conexión. Si sigue pasando, avísale a Federico.» + secundaria «Intentar de nuevo».

### 9.7 Marca de revisión (hallazgo)

- **Para confirmar:** `warning` en `aviso`; «Para confirmar:» en 18/600 `aviso` seguido del mensaje
  en tinta 18; si hay frase, «Frase marcada: «…»» en 15, la frase en tinta. Debajo, la fila de
  casilla «Lo revisé y está bien», con la casilla en la columna del ícono y el texto en x = 56.
- **Hay que corregirlo:** `warning-circle` en `error`; «Hay que corregirlo:» en 18/600 `error` + el
  mensaje en tinta + la frase + «Sin esto no puedes aprobar.» en 15 `error`. Sin casilla.
- Entre hallazgos, separador de 1 px en `linea`. Sin cajas de color.

### 9.8 Campos

- `superficie`, borde de 1 px en `campo` (3,58:1), radio 12, relleno 16, alto mínimo 52. Crecen con
  su texto (`field-sizing: content`, con respaldo en JS): **nunca hay scroll interno**.
- Etiqueta arriba (el rótulo de su sección o 15/600 en tinta en formularios cortos). Ayuda 15
  `apagado` debajo. Placeholder en `apagado` (5,67:1), nunca como etiqueta.
- **Foco:** `--anillo-foco`. **Error:** borde de 2 px en `error` y una sola línea de estado de error
  debajo. El error se dice una vez.
- **Contador** («98 de 2.200»): cifra de 15 `apagado` tabular a la derecha del rótulo; sobre el
  máximo, en `error` con `warning-circle`.
- **Guion:** 20/32, 400, tinta. En el par del rótulo: «Guion» / «123 palabras · ≈ 52 s» y el estado
  del largo («Bien» con `check` en `exito`; «Un poco corto» o «Un poco largo» con `warning` en
  `aviso`). Al editar es un `textarea` normal: un párrafo vacío mide una línea (32).
- **Texto de la publicación:** 18/28, tal cual sale en Instagram, en tinta también en lectura (nunca
  apagado: es lo que se firma).
- **Código de ingreso:** seis casillas en una fila (8 de separación), 64 de alto, `superficie`,
  borde `campo`, radio 12, dígito 24/600 tabular centrado en su casilla. Con error, las seis con
  borde de 2 px en `error` y una sola línea de error debajo; «Mandar otro código» pasa a secundaria.

### 9.9 Editor con marcas de tono

- **Al leer** (guion aprobado, frase marcada): cada marca es una **ficha callada**: Geist 15/500 en
  `apagado` sobre `pista` (4,79:1), cápsula (radio círculo), relleno 0 8, en línea con el texto y
  sin cambiar la interlínea. Muestra los caracteres tal cual («[warm]», «[pause]»): es lo que se
  aprueba. Dice "esto no se lee" sin color ni otra letra.
- **Al editar:** texto plano dentro del `textarea`, con la misma letra y tamaño que el guion. Sin
  capa de resaltado ni `contenteditable`.
- **Ayuda de marcas:** bajo el campo, en 15 `apagado`, siempre visible: «Lo que va entre corchetes
  marca el tono de la voz. No se lee ni sale en los subtítulos.» Debajo, plegable con `caret-down`:
  «Marcas que conozco», que abre las 14 marcas como fichas en filas que se ajustan.
- **Guardar:** con cambios sin guardar, la barra cambia el deslizador por la principal «Guardar
  cambios» y su línea por el motivo «Guarda tus cambios antes de aprobar». No hay otro botón de
  guardar en el flujo. Guardado: línea de estado `exito` «Guardado» con el detalle «· Claude lo
  revisó: 2 observaciones para confirmar abajo, en Revisión.»
- «Volver a la versión de Claude» es un botón de texto bajo el campo, con confirmación en línea
  (gasto cero, trato neutro: principal «Sí, volver» y texto «Cancelar»).

### 9.10 Selección

- **Casilla redonda** de 24: vacía, aro de 1,5 px en `campo` sobre `superficie`; marcada, `tinta`
  llena con `check` Bold de 14 en `sobre-tinta`. Toda la fila es el objetivo (56). Al llegar al
  máximo (5 ideas), las no marcadas quedan con texto `apagado`, aro en `linea` y `aria-disabled`.
- **Avatar:** fotos reales de los looks en 3:4, dos columnas con 12 de separación, radio 12,
  nombre 18/600 debajo («Estudio», «Terraza»). Sin elegir: casilla vacía arriba a la derecha de la
  foto (8 de margen). Elegido: anillo de 2 px en tinta a 3 px de la foto y casilla llena. La foto
  usa `filter: brightness(var(--foto-brillo))`. Toda la tarjeta es un `radio`.
- **Interruptor** (encender y apagar): 52 × 32, círculo. Apagado: pista `pista` con aro de 1,5 px en
  `campo` y perilla de 24 en `campo`. Encendido: pista `tinta` y perilla en `sobre-tinta`, corrida
  20 px en 150 ms. `role=switch`. La casilla es para elegir; el interruptor, para encender.
- **Chip (uno solo):** 44 de alto, relleno 0 14, radio 12, 15/500, contorno de 1 px en `campo`,
  texto en tinta; elegido, `tinta` lleno con texto en `sobre-tinta`. Solo en los filtros de Buscar
  (una fila con scroll lateral, sin fundidos) y en los días de publicación (7 en una grilla de
  columnas iguales con 4 de separación).
- **Pestañas de vista** (Mes · Agenda · Ritmo): texto 18, objetivo de 44, 24 entre pestañas. Activa
  en tinta 600 con un subrayado de 2 px en tinta; inactivas en `apagado` 500. Una línea de `linea`
  bajo la fila. Son enlaces con `aria-current`, no un control segmentado.
- **Paso a paso** (tope de gasto): dos secundarias cuadradas de 44 con `minus` y `plus` y, entre
  ellas, el valor 24/600 tabular («US$ 40»), en la fila con su etiqueta a la izquierda.

### 9.11 Pilar

- **Siempre una palabra, nunca un color.** Nombre largo en 15/400 `apagado` («Deseo y sexualidad»)
  en la meta de filas, piezas, cartas y Agenda. Nombre corto («Pareja», «Deseo», «Autoestima»,
  «Límites», «Bienestar») donde falta ancho: Ritmo y filtros.
- **Chips de pilar:** solo en el filtro de Buscar, con el chip único (9.10): «Todos», «Pareja»,
  «Deseo», «Autoestima», «Límites», «Bienestar», uno elegido a la vez.
- **Elegir pilar** (idea propia): filas con check (9.3), sin borde ni tinte.
- Salen los 5 tonos y sus 4 derivados. `data-pilar` puede quedar en el HTML como dato, sin estilo.

### 9.12 Deslizador para aprobar (la firma)

Un solo control de firma por pantalla, en la barra. Mismo componente en las dos puertas: «Desliza
para aprobar el guion» y «Desliza para aprobar video y fecha».

| Estado | Pista (56, círculo) | Pulgar (48, a 4 del borde) | Etiqueta (18/600) |
|---|---|---|---|
| Listo | `pista` | `firma` con `arrow-right` de 24 en `sobre-firma` | tinta, centrada en el espacio libre (lo único centrado del sistema) |
| Arrastrando | `firma-rastro` desde el borde izquierdo hasta el centro del pulgar | sigue al dedo 1 a 1 | se desvanece con el avance (opacidad 1 a 0 hasta el 60 %) |
| Suelta antes del final | el rastro se retrae | vuelve al inicio en 220 ms (`--curva-vuelta`) | reaparece |
| Aprobado | se llena de `firma` en 220 ms | queda al final en `sobre-firma` con `check` Bold en `firma` | «Aprobado» en `sobre-firma` (6,52:1); luego la línea de estado de la pantalla se reescribe |
| Deshabilitado | `pista` | `superficie` con aro de 1,5 px en `apagado` (4,79:1) y flecha `apagado`, sin relleno | `apagado`; debajo, el motivo (9.13) |

- **Solo arrastrar aprueba.** Tocar la pista no hace nada; tocar el pulgar sin arrastrar tampoco.
  Aprueba al soltar con el pulgar en el tope (96 % del recorrido o más). No es un
  `input type=range` (que salta al punto tocado): son eventos de puntero con captura en el pulgar,
  `touch-action: none` en el pulgar y `pan-y` en la pista.
- Accesibilidad: el pulgar conserva `role="slider"`, el nombre (la etiqueta), `aria-valuenow` de 0 a
  100 y `aria-valuetext` («Aprobado» / «No aprobado»), y se mueve con flechas, Inicio y Fin. Los
  tests e2e ya lo usan así. La alternativa sin arrastre para WCAG 2.5.7 queda por confirmar
  (sección 13).
- Con reducir movimiento: el pulgar salta y la pista se llena sin transición; el gesto es igual.
- «Aprobado» es el `aria-valuetext` que la app ya usa; aquí también se ve.

### 9.13 Barra de firma

La única superficie elevada de Guion y Video. `superficie`, `--sombra-barra`, fija abajo,
`--capa-barra`, relleno 12 / 20 / 8 más la safe area. Contenido limitado a la columna.

- **Trae una acción y una línea, nada más:** el deslizador o la única principal (con su costo), y
  una línea de 15/20 (la ayuda, el motivo o el saldo).
- **Alto:** 104 px con el deslizador y 100 con una principal, más la safe area (138 px en total en
  390 × 844: 16 % del primer pantallazo, frente al 27 % de hoy). Tope de 112 sin la safe area.
- **Una línea por defecto:** en las puertas, la ayuda de dos oraciones se parte: «Aprobar no gasta
  nada.» queda en la barra y «Después grabas la voz y el video.» va bajo la fecha que compromete,
  donde también se lee antes de firmar. Así las dos puertas miden 104.
- **Dos renglones como máximo (124 px)**, solo en dos casos: un motivo largo («Falta elegir el
  avatar y confirmar la revisión.») y el saldo de la barra de grabación (9.14), que no se separa de
  su cifra. Nunca más de dos.
- **Motivo** (deshabilitado): `info` de 16 en tinta + texto 15/500 en tinta, uno a la vez, en el
  orden del inventario («Falta confirmar la revisión.», «Se activa al terminar de verlo.»).
- **Estados:** listo · deshabilitado con motivo · con cambios sin guardar («Guardar cambios») ·
  confirmación del gasto (9.5) · error de aprobación (línea de error de 15 en lugar de la línea) ·
  aprobado (9.12).
- **Fuera de la barra:** «Pedir cambios», «Regrabar», «Volver a revisar el guion» y «Volver a la
  versión de Claude» viven al final del flujo.
- **Sin barra** cuando no hay un siguiente paso posible: una grabación bloqueada por saldo o tope,
  o los estados sencillos (escribiendo, grabando, programado, publicado).
- La navegación inferior se oculta en Guion y Video.

### 9.14 Costo y saldo

- **Costo a la derecha de su acción**, en dos renglones alineados a la derecha y tabulares: el
  monto en 24/28 600 en tinta («US$ 1,16») y la unidad en 15 `apagado` («~52 s», «~682
  caracteres»). Si incluye la voz, la unidad lo dice («~52 s · incluye la voz»). Grilla `1fr auto`
  con 16 de separación; el monto mide unos 104 px y deja 230 para la etiqueta.
- **Saldo debajo**, en la línea de 15 `apagado` a todo el ancho, alineado a la izquierda, completo
  y junto a su acción: «ElevenLabs: te quedan 99.000 de 100.000 caracteres. Se renuevan el 12 de
  octubre.», «Saldo de API de HeyGen: US$ 50,00. Es aparte de tu plan de HeyGen.». Puede ocupar dos
  renglones: la explicación de un saldo no se separa de su cifra.
- **Saldo desconocido** (no bloquea): la línea dice «No pude ver tu saldo de ElevenLabs.» en
  `apagado`.
- **Bloqueo** (saldo que no alcanza o tope del mes): la acción queda deshabilitada **en el flujo**,
  con su costo, y el bloqueo completo va como línea de estado `aviso` a 18 bajo la cabecera de la
  pieza (`warning` en `aviso`, texto en tinta). No hay barra. Nunca letra gris centrada.
- Sin configuración legible: la acción funciona y no se muestran costo ni saldo.
- Nunca se centra un costo, una ayuda ni un motivo.

### 9.15 Medidor del gasto del mes

- En Ajustes, bajo la fila del tope: «Llevas US$ 22,00 este mes» en 15/500 tinta, con la cifra
  tabular; debajo, el medidor a todo el ancho: pista de 4 px en `pista` (círculo) y relleno en
  `tinta` hasta lo gastado sobre el tope.
- **Desde el 80 %** del tope: relleno y texto en `aviso`, con `warning` de 16 delante del texto.
- **Al 100 %:** igual, y la línea de estado «Llegaste al tope de gasto de este mes.» bajo el
  medidor. El texto dice siempre la cifra: el medidor nunca es la única señal.

### 9.16 Reproductor de voz

- Grilla de 48 + 1fr + auto con 12 de separación, sin caja.
- **Play:** círculo de 48 con aro de 1,5 px en tinta y `play` Fill de 20 en tinta (`pause` al
  sonar). En contorno para que la principal siga siendo la única forma llena.
- **Avance:** objetivo de 44 de alto; riel de 2 px en `campo`, recorrido de 2 px en tinta y perilla
  de 14 en tinta. Se arrastra para adelantar.
- **Tiempo:** «0:00 / 0:52» en 15 tabular a la derecha.
- **Estado debajo**, alineado con el inicio del riel (x = 80): «Escucha cómo suena antes de
  grabar» (`apagado`), «Ya la escuchaste» (`exito` con `check` de 16) o «No pude cargar la voz.
  Recarga la pantalla.» (`error` con `warning-circle`). En «error de producción» no se muestra
  «Escucha cómo suena antes de grabar»: va «Mientras tanto, puedes escuchar la voz.» sobre el
  reproductor.

### 9.17 Reproductor de video (puerta 2)

- **9:16 al alto disponible:** alto = el menor entre (ancho de la columna × 16 / 9) y (`100dvh` −
  safe area superior − 44 del volver − 8 − alto de la barra − safe area inferior − 16). En 390 × 844
  queda en unos 332 × 591 (ancho × alto): el video entero y su play se ven al cargar, sobre la barra. Centrado en
  la columna (los medios se centran; el texto no). Radio 12, fondo `tinta` mientras carga.
- **Controles dentro del video:** play de 64 al centro (disco en `velo-video`, `play` Fill de 28 en
  `sobre-video`), que se oculta al reproducir; **tocar en cualquier parte reproduce o pausa**.
  Abajo, sobre un degradado de `velo-video` a transparente de 96 px (el único degradado del sistema,
  por legibilidad): el avance arrastrable (riel de 2 px en `sobre-video` al 50 %, recorrido y perilla
  de 14 en `sobre-video`, objetivo de 44) y «0:00 / 0:48» en 15 tabular.
- **«Avatar IA»** arriba a la izquierda, fijo: 15/600 en `sobre-video` sobre `velo-video`, radio
  12, 28 de alto, a 12 del borde.
- **Zonas de Instagram** (con «Ver zonas de Instagram»): franja inferior del 22 % y columna derecha
  con borde de 1,5 px discontinuo en `sobre-video`, y «Aquí Instagram pone el texto y los botones»
  en 15 sobre `velo-video`.
- **Falla:** «No pude cargar el video. Recarga la pantalla.» en línea de error bajo el video (no al
  centro del cuadro).
- El video nunca se atenúa, tampoco de noche. Debajo: par de meta, título de 24, la línea de estado
  «Míralo completo para aprobar» → «Lo viste completo» (`exito`) y el botón de texto «Ver zonas de
  Instagram». La revisión, «Así sale en Instagram», la fecha y «Regrabar» fluyen planos después
  (sin panel elevado).
- **Fecha de publicación:** fila con valor «jueves 8 de octubre · 19:00» en tinta 600 + «Cambiar»;
  debajo «Hora de Chile · próximo horario libre» en 15 `apagado`. Al cambiar, las 4 opciones como
  filas con check.

### 9.18 Carta de idea (Ideas)

- La única superficie elevada de Ideas: `superficie`, `--sombra-flotante`, radio 12, relleno 20,
  alto de su contenido, sin tinte. Entra con 8 px y fundido en 220 ms al cambiar de idea.
- Arriba de la carta, el par «Nuevas de la semana» (15/600 tinta) / «Idea 1 de 3» (15 `apagado`).
- Dentro: pilar (palabra), gancho 24/600, tema 18 `apagado`, meta 15 («Fuerza alta · Mito o
  realidad»); «Respaldo débil» como palabra de la meta, no como chip; alertas («Verificar dato»)
  como líneas de estado `aviso`. Luego, **justo bajo el gancho**, «Después» (secundaria) y «Usar
  esta» (principal) en una fila. Al final, «Por qué» con `caret-down`, que se abre hacia abajo sin
  mover los botones.
- Fuera de la carta: «Descartar» (destructiva, sus 4 motivos como filas con check, y «Deshacer» en
  el toast) y «Escribir una idea mía» (texto con `plus`).

### 9.19 Calendario

- **Pestañas:** Mes · Agenda · Ritmo (9.10), bajo el título «Octubre».
- **Celdas del mes:** iniciales «L M M J V S D» en 15/500 `apagado`; grilla de 7 columnas con 4 de
  separación (unos 47 de ancho) y 48 de alto. Número 15/500 tabular en tinta, centrado en su celda.
  Días pasados en `apagado`. **Hoy:** círculo de 36 en `tinta` con el número en `sobre-tinta` 600.
  **Con publicación:** punto de 6 en `tinta` 4 px bajo el número (uno por publicación, hasta 2), y
  la celda se toca (lleva a la Agenda en ese día). Celdas vacías antes del día 1, sin nada. El
  lector oye «jueves 8: Pareja y conversación» (y «, para subir» cuando aplica).
- **Agenda:** por semana, el rótulo de sección «Semana del 5 al 11 de octubre». Filas en grilla de
  72 + 1fr: a la izquierda «Jueves 8» 15/600 y «19:00» 15 `apagado` tabular; a la derecha el título
  18/600, el pilar (palabra) y el estado como línea compacta de 15/500 con su ícono de 16
  («Programado» en `exito`, «Para subir» y «Falta tu firma: video y fecha» en `aviso`, «Algo falló
  al grabar» en `error`; «Grabando la voz» en tinta con el punto que late). Se toca cuando hay algo
  que hacer. **Libre:** «Libre · elige una idea» en 18/500 `apagado` con `caret-right`, sin caja
  punteada.
- **Ritmo:** grilla de 56 + 3 columnas iguales; encabezados «Mar», «Jue», «Sáb» en 15/600; semanas
  «14 sep», «21 sep»… en 15 `apagado` tabular (la actual en tinta 600). Celda de 44: **llena**, la
  primera palabra del pilar en 15/500 tinta sobre una barra de 4 px en tinta; **libre**, «libre» en
  15 `apagado` sobre una línea de 1 px en `campo`. Sin cajas ni bordes punteados.

### 9.20 Métricas

- **Cifra:** el número en 24/600 tabular («50,4») y su unidad en 15 `apagado` («cada 1.000»), en la
  misma línea base.
- **Barra de métrica:** 4 px en tinta, ancho proporcional al mejor visible, **sin pista**, extremos
  redondos. Debajo, la muestra en una línea de 15 («121 guardados de 2.400 personas») y el pilar con
  su conteo en `apagado` («Pareja y conversación · 1 reel de este tema»). Sin números: sin barra y
  «Todavía sin números: llegan cada mañana a las 7:00.»
- **Progreso de reels** (8 segmentos): fila de 8 con 4 de separación; llenos, barra de 4 px en
  tinta; vacíos, línea de 1 px en `campo` alineada a la base. La frase dice el conteo («lleva 1 de
  8»).
- La comparación va arriba, en texto; luego las 5 primeras de «Lo que sirvió»; el resto y «Semana a
  semana» quedan plegados bajo su rótulo.

### 9.21 Ajustes

- Listas planas al estilo de iOS, sin celdas agrupadas: rótulo de sección y filas con valor,
  interruptor o navegación (9.3).
- **Días de publicación:** 7 chips (9.10) y debajo la fila con valor «A las · 19:00 hora de Chile»
  con el selector de hora nativo.
- **Meta de este mes:** fila con valor («Consultas») y selector nativo.
- **Tope de gasto al mes:** fila con el paso a paso y, debajo, el medidor (9.15).
- **Avisos:** filas con interruptor («Resumen diario a las 08:30», «Avisarme apenas falle algo») y
  el bloque del celular como líneas de estado y una principal («Activar avisos»).
- **Estado de la configuración:** solo mientras falte algo, como línea de estado con su lista de
  pasos (cada paso con «Listo» `exito` o «Falta» `aviso`, texto e ícono a la derecha) y una
  principal. No repite las cuentas.
- **Cuentas conectadas:** una fila de navegación que abre su propio nivel; ahí van cada cuenta con
  su estado a la derecha (texto 15/500 con ícono en su tinta, no chip), sus llaves (campo de
  contraseña + «Guardar y comprobar») y los saldos con su explicación al pie.
- «Cerrar sesión», botón de texto en tinta, al final.

### 9.22 Navegación inferior

Tres pestañas sobre el fondo con una línea de `linea` arriba, sin sombra, `--capa-barra`. Ícono de
24 y etiqueta 15/20, 56 de alto más la safe area. Activa en tinta 600 con una regla de 2 × 24 px
arriba (la misma gramática de reglas); inactivas en `apagado` 500. «Inicio», «Métricas», «Ajustes».
**Inicio queda activa en Ideas y Calendario.** Se oculta en Guion y Video.

### 9.23 Toast

`tinta` lleno, texto 18/24 en `sobre-tinta`, «Deshacer» 600 subrayado con objetivo de 44 a la
derecha, radio 12, relleno 12 / 16, `--sombra-flotante`, `--capa-toast`. Ancho de la columna menos
los márgenes. Flota 12 px sobre la barra o la navegación. Entra con 8 px y fundido en 200 ms y dura
**8 s**. Nunca tapa lo que se acaba de tocar: los 96 px libres al final de cada página lo
garantizan para el último control. Errores en el toast solo si son transitorios.

### 9.24 Cargando

Esqueleto con la forma final, nunca spinner: barras de 12 de alto en `pista` con extremos redondos
(título a la mitad del ancho, filas a 4/5 y 3/5). Late en opacidad (1 a 0,55) cada 1,6 s; quieto con
reducir movimiento. Bloque de estado, cuentas y saldos cargan con su propio esqueleto.

### 9.25 Estados vacíos y momento de cierre

- **Vacío:** bajo su rótulo (la regla se queda para que la página conserve su esqueleto), una frase
  18/600 en tinta, un detalle 15 `apagado` y una sola acción (secundaria o fila de navegación).
  Alineado a la izquierda, sin ilustración ni caja. Ejemplos: «Nada espera tu firma esta semana.» /
  «El lunes a las 8:00 te propongo 5 ideas nuevas.» / «Elegir ideas ahora»; «Nada programado este
  mes.» / «Elegir ideas»; «Todavía no hay reels publicados.» / «Cuando salga el primero, aquí vas a
  ver qué le sirvió a la gente.»; «No encontré ideas con esa palabra.» / «Escribir una idea mía».
- **Momento de cierre** («Ya se publicó», «Subido a mano», «Programado para…»): el esqueleto de
  pieza con `check-circle` de 32 en `exito`, el título del estado en 24/600, el detalle en 18 y el
  video en miniatura (72 × 128, radio 12), más «Ver en Instagram» con `arrow-up-right`. Sin
  animación de celebración.

---

## 10. Composición por pantalla (lo que cambia sobre `sintesis.md` sección 6)

- **Datos:** los de `inventario.md` sección 14. «Hoy» es el martes 6 de octubre, 10:30. La fecha
  canónica es «jueves 8 de octubre · 19:00». «Ideas de la semana» no repite piezas en curso: «Un
  visto sin respuesta y ya imaginas lo peor. ¿Te pasa?», «¿Tu deseo se apagó o tu cuerpo está en
  modo alerta?», «¿Por qué sientes culpa al descansar?» y «Estar cansada no siempre es cansancio.».
- **Ingreso:** wordmark a 20 arriba (64 de aire), «Hola, Coni» en 32, el texto en 18 `apagado` con
  el correo en tinta 600, principal «Mandarme el código» con `arrow-right`.
- **Inicio:** par «Hola, Coni» / «Semana del 5 al 11 de octubre»; título de 32 en dos líneas «2
  cosas esperan tu firma» con «unos 6 min» en 18 `apagado` pegado debajo (4 de aire); notas de
  pieza; «Necesita tu firma · 2» (la regla cae cerca de los 240 px; el video lleva miniatura); «Para
  subir a Instagram»; los avisos que no apuntan a una firma; «En camino» + «Ver calendario»; «Ideas
  de la semana» con casillas y la principal «Escribir 3 guiones» + «Ver todas las ideas»;
  «Consultas» con «3 consultas en octubre» y la secundaria «Llegó una consulta».
- **Guion por aprobar:** fecha que compromete, guion a todo su alto, texto de la publicación, avatar,
  revisión, «Pedir cambios» al final; barra con el deslizador.
- **Guion aprobado:** estado «Guion aprobado · falta grabar», voz (reproductor + la grabación que no
  va en la barra, en secundaria con su costo), guion en lectura con fichas, texto de la publicación
  en tinta, avatar en miniatura, «Volver a revisar el guion» al final; barra con «Grabar voz» (sin
  voz) o «Grabar video» (con voz).
- **Video por aprobar:** 9.17 y la barra con el deslizador y su motivo.
- **Calendario, Métricas, Ajustes, Ideas, estados sencillos:** con los componentes 9.18 a 9.25.

---

## 11. Accesibilidad

- WCAG 2.2 AA en todo par de texto (tablas de la sección 3) y 3:1 en contornos de control.
- Base de 18 px, principales de 52, objetivos de 44 o más (filas de 56 y 64).
- Ningún estado solo por color: texto o ícono siempre. El pilar va escrito.
- Foco visible con `--anillo-foco` en todo lo enfocable; lo deshabilitado sigue enfocable y su motivo
  se lee.
- Reducir movimiento: duraciones a 0, latido quieto, gesto igual.
- Safe areas arriba y abajo; `viewport-fit=cover`; nada de `100vh` (siempre `dvh`).
- Errores con `role=alert`; avisos de carga con texto para lector; «Sin leer» en el punto de no
  leído; «Código de 6 números» y «Número 1 de 6» en las casillas.

---

## 12. Hacer y no hacer

| Hacer | No hacer |
|---|---|
| Agrupar con aire y con una regla de 1 px | Cajas, tarjetas o fondos teñidos para agrupar |
| Cifras a la derecha, tabulares; el monto a 24 | Plata o saldos en letra chica centrada |
| Una principal por vista, en tinta | Dos botones llenos, o un botón en el color de la firma |
| La frambuesa solo en el pulgar, la pista que firma y «sale el …» | Frambuesa en foco, pestaña activa, enlaces, hoy, selección o errores |
| El wordmark solo en Ingreso, el ícono y el manifest | El wordmark dentro de una pantalla de trabajo o en `/l` |
| El pilar como palabra apagada | Pilar como color, punto de color o píldora teñida |
| Estados escritos con ícono en su tinta | Estados solo por color, o en cajas de error |
| El guion a todo su alto, en 20/32 | `textarea` con scroll propio |
| Marcas de tono como fichas al leer, texto plano al editar | Una segunda familia o una capa de resaltado |
| Lo destructivo en texto `error` con confirmación en línea o «Deshacer» | Destructivo en botón lleno, o «Sí, …» con el trato de aprobar |
| Etiquetas, ayudas, costos y motivos a la izquierda | Centrar texto fuera de la etiqueta del deslizador |
| Medios y cifras dentro de una celda, centrados en su celda | Centrar un bloque de texto |
| Lleno = 4 px en tinta; vacío = 1 px en `campo` | Pistas pesadas de fondo detrás de cada barra |
| Movimiento de 150 a 220 ms en respuesta al toque | Animaciones de entrada, rebotes, glow, vidrio, degradados de adorno |
| Rayas cortas `-` o puntos medios para separar | La raya larga, en cualquier texto |

---

## 13. Pendientes y por confirmar

1. **El deslizador en el iPhone de Coni (WebKit):** que tocar no apruebe y que el arrastre se sienta
   bien. Y la alternativa sin arrastre para WCAG 2.5.7 (tocar el pulgar y confirmar en línea): pide
   copy nuevo.
2. **Copy nuevo:** la confirmación de «Descartar esta pieza»; el plegable «Marcas que conozco»
   (hoy es el comienzo de una línea de ayuda); el «Ver todas» de Métricas; la fecha en «Ya se
   publicó» si el dato existe.
3. **Avisos de Inicio:** fundir los que apuntan a una pieza ya listada como punto de no leído (C9 de
   la síntesis).
4. **Dynamic Type de iOS en la PWA:** los `rem` crecen con el tamaño de letra del navegador, pero
   Safari solo aplica el de iOS con `font: -apple-system-body` en `html` (base de 17, no 16). Hay que
   probarlo y recalibrar la escala antes de prometerlo.
5. **Oscuro:** está cableado y sigue a iOS. Si Federico prefiere salir solo en claro, basta con no
   incluir el bloque `prefers-color-scheme` (el atributo `data-theme` sigue sirviendo para probar).
6. **Barra de 124 px:** un motivo largo y el saldo de la barra de grabación pueden ir en dos
   renglones (124 px, sobre el tope de 112 del brief). Medir en el mockup. Para volver a 112 habría
   que acortar ese copy, y eso lo decide Federico.
7. **WebKit y `field-sizing: content`:** confirmar soporte en el iOS de Coni; si no, el respaldo en
   JS.
8. Las inconsistencias de copy de `inventario.md` 15.2 (lunes 8:00 frente a domingo 20:00, dos
   textos del tope, el motivo sin punto final) siguen abiertas: el sistema no las resuelve.
