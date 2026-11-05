# Puertas en computador: critique (carrusel 1, video 2, carrusel 2)

> `/impeccable critique` sobre las tres puertas de firma que quedaban con la columna del teléfono en computador (issue
> #75), a 1280 x 900, antes de tocarlas. Contexto: `docs/PRODUCT.md` y `docs/DESIGN.md` (registro product). Referencia:
> la puerta 1 del guion (`2026-11-05-puerta-uno-escritorio-critique.md`), ya en dos columnas.
> Regla de Federico (05-11-2026): toda pantalla de escritorio pasa por una skill de UX y se reordena para usar el ancho.

## Evaluaciones

- **A (revisión de diseño):** capturas «antes» en `/tmp/puertas-escritorio/antes/` (1280, 1440, 1024 completa y letra
  grande a 1280 de cada puerta) y el código de `pantalla-carrusel.tsx`, `puerta-2-carrusel.tsx`, `pantalla-video.tsx`,
  `riel-de-laminas.tsx` y `reproductor-video.tsx`. Hecha en la misma sesión que el arreglo (sin subagente aparte).
- **B (detector determinista):** `npx impeccable detect --json` sobre esos cinco archivos: sin hallazgos (`[]`).
- **Medición:** los `*.escritorio.ts` nuevos, corridos antes del arreglo, fallan en las tres puertas en lo mismo: la
  firma no queda al lado de lo que se revisa (17 de 24 pruebas en rojo).

## Lo común a las tres

La misma composición del teléfono centrada en 560 px, con la hoja de firma fija abajo. En computador esa hoja
(«Falta:», pista y consecuencia, unos 155 px) tapa justo lo que ella revisa: en la puerta 1 del carrusel, la lámina 4;
en la puerta 2 del carrusel, las flechas del riel y el título «Así sale en LinkedIn»; en el video, el título, la casilla
de revisión y la fecha. Sobran unos 720 px de piedra a los lados. Con letra grande la hoja cubre además el comienzo del
contenido (se ve en la captura completa de la puerta 1 del carrusel).

Lo que funciona en las tres y no se toca: una sola decisión por pantalla, «Falta:» en sus palabras en vez de un botón
muerto, el orden estable de los pasos y la consecuencia bajo la pista.

## 1. Puerta 1 del carrusel (`guion_por_aprobar`)

| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | «Falta: revisar 1 aviso», pero el aviso está al fondo y la hoja tapa el camino |
| 2 | Lenguaje del mundo real | 4 | Láminas numeradas con su rol (Portada, Idea, Cierre) |
| 3 | Control y libertad | 3 | Pedir cambio con una frase y Descartar con confirmación |
| 4 | Consistencia | 2 | La puerta 1 del guion ya está en dos columnas y esta no |
| 5 | Prevención de errores | 3 | La firma espera el aviso marcado; la lámina que lee queda bajo la hoja |
| 6 | Reconocer antes que recordar | 2 | El aviso de la lámina 2 se ve después de la lámina 6 y del post |
| 7 | Flexibilidad y eficiencia | 2 | Seis láminas y un post largo en 560 px: mucho scroll para un texto corto |
| 8 | Estética y minimalismo | 3 | Sobria; ancho vacío |
| 9 | Recuperación de errores | 3 | Errores de acción sobre la pista |
| 10 | Ayuda | 3 | «Firmas las láminas y el texto. Todavía no se publica nada.» |
| **Total** | | **28/40** | **Bueno, misma falla de composición que tenía el guion** |

Problemas priorizados:

1. **[P1] La hoja de firma tapa las láminas.** Arreglo: dos columnas como el guion. Izquierda lo que firma (láminas y
   texto del post, con su revisión y «Pedir cambio»); derecha el ángulo y la firma, pegada arriba mientras lee.
2. **[P2] El ángulo ocupa todo el ancho de lectura** para un select de 3 palabras. Va arriba de la columna derecha,
   como en el guion: es una decisión, no algo que se lee.
3. **[P2] Pedir cambio queda lejos de la firma.** Se queda con el texto (es la otra salida de lo que revisa, como
   «Editar el guion»), y el orden de foco sigue los pasos: ángulo, láminas, texto, aviso, Pedir cambio, firma.
4. **[P3] Descartar al pie de la columna de lectura**, lejos de la firma, como en el guion.

## 2. Puerta 2 del video (`video_por_aprobar`)

| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | «Míralo completo» sobre el cuadro y «Lo viste completo» después |
| 2 | Lenguaje del mundo real | 4 | «Revisé labios, nombre, subtítulos y cortes»: lo que de verdad revisa |
| 3 | Control y libertad | 3 | Regrabar con costo y confirmación, en Más opciones |
| 4 | Consistencia | 2 | Hoja inferior del teléfono sobre un escritorio |
| 5 | Prevención de errores | 3 | La firma espera el video completo y la casilla |
| 6 | Reconocer antes que recordar | 2 | Mientras el video corre, la casilla y la fecha quedan bajo la hoja |
| 7 | Flexibilidad y eficiencia | 2 | El video se achica a `100svh - 16rem` (unos 360 px de ancho) aunque haya espacio |
| 8 | Estética y minimalismo | 3 | Sobrio; el cuadro chico en medio de piedra vacía |
| 9 | Recuperación de errores | 3 | «No pude cargar el video. Recarga la pantalla.» |
| 10 | Ayuda | 3 | Zonas de Instagram a pedido |
| **Total** | | **28/40** | **Bueno, con el video más chico de lo que podría** |

Problemas priorizados:

1. **[P1] La hoja tapa la casilla y la fecha**, los dos pasos que «Falta:» nombra. Arreglo: dos columnas; a la izquierda
   lo que revisa (el video y, bajo él, los textos que salen con él); a la derecha el título, «Lo viste completo», la
   casilla, «Dónde y cuándo», Más opciones y la firma, pegada arriba mientras lee los textos.
2. **[P1] El video no usa el alto.** Para revisar labios y subtítulos el cuadro debe ser lo más grande que quepa entero:
   en computador se dimensiona por el alto de la ventana (9:16 intacto, entero sin scroll a 1280 x 900), no por los
   16rem que reserva el teléfono para la hoja.
3. **[P2] El título queda bajo el video.** En computador encabeza la columna de decisión: ella lee qué es, revisa y firma
   sin cambiar de columna.
4. **[P3] Regrabar sigue plegado en Más opciones**, en la columna de la decisión, lejos de la pista. Sin cambio.

## 3. Puerta 2 del carrusel (`carrusel_por_aprobar`)

| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | «Lámina N de 6» y los puntos; la hoja tapa ambos |
| 2 | Lenguaje del mundo real | 4 | «Desliza para leerlo completo», «Cuándo sale» |
| 3 | Control y libertad | 3 | Pedir cambio (texto o diseño), Cambiar la fecha |
| 4 | Consistencia | 2 | Igual que las otras: patrón del teléfono |
| 5 | Prevención de errores | 3 | Programar espera ver todas las láminas |
| 6 | Reconocer antes que recordar | 1 | «Falta: ver todas las láminas» y las flechas para hacerlo quedan bajo la hoja |
| 7 | Flexibilidad y eficiencia | 2 | Lámina de 426 px en 1280 px; las flechas exigen scroll |
| 8 | Estética y minimalismo | 3 | El riel con la siguiente lámina asomando funciona |
| 9 | Recuperación de errores | 3 | Errores de acción sobre la pista |
| 10 | Ayuda | 3 | «Sale el sábado 7 · 19:00» bajo la pista |
| **Total** | | **27/40** | **Aceptable: lo que falta para programar está tapado** |

Problemas priorizados:

1. **[P1] La hoja tapa las flechas del riel**, que son el único camino de teclado y mouse para cumplir lo que «Falta:»
   pide. Arreglo: dos columnas; izquierda el riel y el texto del post; derecha «Cuándo sale» y la firma.
2. **[P1] La lámina no se ve entera con sus flechas.** En computador la lámina toma el tamaño con que LinkedIn la
   muestra (unos 500 px de ancho) pero acotada por el alto de la ventana, para que lámina, flechas y contador quepan
   sin scroll a 1280 x 900.
3. **[P2] La fecha queda debajo del post largo.** Va a la derecha, sobre la firma: es la decisión.
4. **[P3] Descartar al pie de la columna de lectura**, como en las otras puertas.

## Personas

- **Coni (no técnica, 15 min a la semana, en el computador):** en las tres puertas, lo que tiene que mirar para firmar
  queda bajo la hoja, y para llegar a la casilla, la fecha o las flechas tiene que bajar y volver.
- **Usuario de teclado:** el orden de foco sigue los pasos del teléfono; en dos columnas se mantiene (el DOM no cambia),
  y el salto entre columnas lo explica el orden de los pasos.

## Restricciones para el arreglo

- Teléfono (contenedor < 40rem) idéntico al píxel: el DOM conserva su orden y los envoltorios nuevos no cambian márgenes.
- Mismo patrón que el guion: variantes `dos-columnas:` por container query, `data-ancho="puerta"`, firma como panel en
  relieve pegado arriba en la columna derecha. Con letra grande, una columna.
- Lo compartido por las cuatro puertas (clases de la grilla, de la cabecera y de la firma en columna) sale a un módulo.

## Después del arreglo (`/impeccable layout` y `web-design-guidelines`)

Capturas «después» en `/tmp/puertas-escritorio/`. Lo que quedó y por qué:

- **Grilla compartida** (`components/puerta-en-columnas.ts`): columnas, cabecera en subgrid y firma en columna, usadas
  por las cuatro puertas (también el guion, sin cambio de comportamiento). Cada pantalla pone sus filas.
- **Carrusel, puerta 1:** filas `auto auto auto 1fr`; la lectura (láminas y post) abarca de la fila 2 al final, el
  ángulo arriba a la derecha y la firma en la última fila, pegada arriba mientras baja por las láminas.
- **Carrusel, puerta 2:** la lámina mide `min(82 %, (100svh − 19rem) · 4/5)`: unos 477 px a 1280 x 900, lámina,
  flechas y contador sin scroll. «Cuándo sale» alineado con la primera línea del riel.
- **Video, puerta 2:** el cuadro mide `(100svh − 7rem) · 9/16` de ancho como máximo: unos 788 px de alto a 1280 x 900,
  entero sin scroll, contra 628 antes. El título encabeza la columna derecha alineado con el borde del video. La firma
  abarca su fila y la de los textos, así sigue a la vista mientras ella lee el texto de LinkedIn.
- **Teléfono:** el DOM conserva su orden; los envoltorios nuevos llevan el `mt-8` de la primera sección que se pierde
  por `first:mt-0`, así que los márgenes son los mismos.
- **Ritmo:** el video queda centrado en su columna (como en el teléfono): reparte el aire a sus dos lados en vez de
  dejar un hueco de unos 200 px junto a la decisión. Alinearlo a la izquierda con «Inicio» y los textos es la
  alternativa si Federico prefiere el borde común.

`web-design-guidelines` sobre los archivos tocados: sin hallazgos nuevos. Quedan dos previos, fuera de este cambio:
los `textarea` de «Pedir cambio» sin `name`/`autocomplete`, y con texto ampliado en computador (sin `data-letra`, que
solo se activa bajo 18rem de ancho) la firma vuelve a la hoja fija abajo del teléfono, que puede tapar el foco: el
mismo comportamiento que ya tiene el guion.
