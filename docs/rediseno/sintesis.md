# Síntesis de las tres auditorías: rediseño de Conidolly

> Insumos: `impeccable.md` (I), `design-taste.md` (D) y `ui-ux-pro-max.md` (U), más `../inventario.md`,
> `estudio-coni/docs/PRODUCT.md` y `~/.claude/lessons/ui-methodology.md`. 4 de octubre de 2026.
> Solo lectura sobre `estudio-coni`: no se tocó código.
> Verificado en esta síntesis (sección 8): el toque que aprueba en el deslizador, el alto del
> reproductor, el «Descartar» como principal, la barra que tapa el play y los contrastes de la
> paleta nueva.

---

## 0. Escena y lectura común

**Escena física.** Coni, entre un paciente y otro, en su consulta con luz de día o en el auto
estacionado, mira el iPhone dos o tres minutos con brillo automático. Lee un guion de 120 palabras,
ve un video de 50 segundos y decide sola, con calma, en su propio nombre. Eso pide tema claro,
contraste alto, letra que se lea sin zoom y una sola cosa importante por pantalla.

**En qué coinciden las tres.** Los huesos están bien: el copy, un solo gesto para aprobar, la lista
serena de Inicio, el costo junto a cada botón que gasta y la honestidad de Métricas. Lo que falla es
la piel y el orden: un lavado rosado donde la marca, el error y el fondo son del mismo color; una
serif de "app de bienestar"; pilares que pintan superficies completas; cajas dentro de cajas; y
barras fijas que tapan justo lo que hay que revisar. El rediseño no inventa flujos: quita pintura,
cajas y tamaños, y deja que la tipografía, el espacio y un solo color con significado hagan el
trabajo.

---

## 1. Hallazgos deduplicados, ordenados por impacto

Severidad unificada: **Crítica** = puede producir una aprobación no deliberada, una pérdida o un
gasto, o tapa la tarea de una puerta. **Alta** = fricción en el flujo semanal (Inicio, puerta 1,
puerta 2) o falla WCAG AA. **Media** = ruido, inconsistencia o carga en flujos secundarios.
**Baja** = pulido. Columna "Vio": qué auditoría lo levantó.

| # | Sev. | Hallazgo | Vio | Evidencia |
|---|---|---|---|---|
| 1 | Crítica | **Video: el play no se ve al cargar.** El 9:16 mide hasta 88dvh y su fila de controles queda bajo la barra fija (que parte cerca de los 664 px). El `<video>` no responde al toque y la barra de avance es un `div`: no se puede saltar a un momento. | I, U | `video-por-aprobar-pantalla.png`, `reproductor-video.tsx:27` |
| 2 | Crítica | **El deslizador aprueba con un toque.** Es un `input range` nativo: tocar el extremo derecho de la pista deja el valor en 100 y `alMover` llama a `aprobar()` (umbral 96). Además, deshabilitado se ve más pesado que habilitado (pulgar 5,19:1 frente a 5,06:1). | U, I | `deslizar-para-aprobar.tsx`, prueba en Chromium (WebKit sin verificar) |
| 3 | Crítica | **Lo destructivo no se frena.** «Descartar esta pieza» no pide confirmación y, cuando es la única acción («Para subir a mano»), sale como botón frambuesa lleno: lo más fuerte de la pantalla. «Regrabar» (US$ 1,16), «Pedir cambios» y «Descartar» idea usan el mismo trato que «Copiar texto»; «Sí, regrabar» y «Sí, pedir cambios» usan el mismo botón que aprobar. «Descartar» idea no tiene «Deshacer». | I, D, U | `estado-de-pieza.tsx:45`, `video-para-subir.png`, `ideas-descartada.png` |
| 4 | Alta | **El guion que se firma se lee por una ventanita.** `textarea` de 12 filas con scroll propio; cabecera teñida 36 % y barra fija 27 % del primer pantallazo: quedan unas 6 líneas. Rompe "con lo aprobado completo a la vista". | I, D, U | `guion-por-aprobar-pantalla.png`, `guion-editando.png` |
| 5 | Alta | **Monocromía rosa y un acento que significa todo.** Fondo, acento y error en la misma familia (336° y 0°); un error se lee como marca. La frambuesa cumple más de 10 papeles (aprobar, navegar, hoy, foco, rótulos, descartar, regrabar, cerrar sesión) y deja de decir "actúa aquí". | I, D, U | `inicio-con-avisos.png`, `guion-texto-con-error.png` |
| 6 | Alta | **Pilares como pintura.** 5 tonos × 4 derivados = 20 colores que tiñen cabeceras, cartas, Agenda, Ritmo y barras. Chocan con los estados (Límites verde como éxito, Bienestar amarillo como aviso, Deseo magenta como el acento y lavanda en territorio "morado IA"). | I, D, U | `calendario-agenda.png`, `ideas.png`, `guion-por-aprobar-pantalla.png` |
| 7 | Alta | **Campos invisibles.** Bordes a 1,23 y 1,29:1 (WCAG 1.4.11 pide 3:1): casillas del código, área del guion, «De qué trata», espacios «libre». Botón deshabilitado a 1,08:1 como forma. | I, D, U | `ingreso-codigo.png`, `ideas-propia.png` |
| 8 | Alta | **Inicio entierra la firma.** Los avisos repiten las mismas piezas de «Necesita tu firma» y van antes; con notas, la firma parte cerca de los 889 px. La página mide 2,5 pantallas y la jerarquía está al revés: «Hola, Coni» a 30 px no informa y «2 cosas esperan tu firma · unos 6 min» va apagado. | I, D, U | `inicio-pantalla.png`, `inicio-con-avisos.png` |
| 9 | Alta | **Dinero y bloqueos en letra chica.** El bloqueo por saldo de HeyGen son 5 a 6 líneas grises centradas bajo un botón gris; «Llevas US$ 38,00 este mes» con tope de US$ 40 va apagado bajo un «Todo conectado» verde. | I, U, D | `guion-sin-saldo-heygen.png`, `ajustes-gasto-cerca-del-tope.png` |
| 10 | Alta | **Dos principales y el siguiente paso lejos.** «Guardar cambios» lleno compite con el deslizador; «Grabar voz» y «Grabar video» son dos bloques llenos iguales; ya aprobado, grabar queda a 1.370 y 1.690 px, tras releer todo el guion. | I, D, U | `guion-aprobado.png`, `guion-editando.png` |
| 11 | Alta | **Tipografía fuera de regla y sin escala.** Young Serif y Hanken Grotesk (ninguna permitida), 8 tamaños reales (16 y 17 px sueltos 41 veces), el guion cambia de cara entre editar (serif 20) y leer (sans 17 a 18), el título de pieza mide 30 en Guion y 24 en Video. | I, D, U | `globals.css:74-75`, `editor-de-guion.tsx:131` |
| 12 | Alta | **Métricas como volcado.** Con 16 reels mide unos 4.500 px; la conclusión queda a dos tercios; «Semana a semana» repite lo de «Lo que sirvió»; barras con pista y color por pilar. | I, D, U | `metricas-comparacion.png` |
| 13 | Media | **Caja sobre caja.** Unas 10 familias de contenedor, 6 de chip, 6 radios; anidación real (motivos de descarte, panel del video, hoja de instalación, bloque de estado, tarjeta de avatar). | I, D, U | `ideas-descartar-motivo.png`, `video-visto-revisar.png`, `ajustes.png` |
| 14 | Media | **Orientación inconsistente.** Ideas y Calendario sin pestaña activa; los estados sencillos no tienen «‹ Inicio» arriba (tres formas de volver); Calendario y Métricas se titulan «Octubre»; «Programado» en Inicio no se puede tocar. | I, D, U | `ideas.png`, `calendario-mes.png`, `video-programado.png` |
| 15 | Media | **Video después de verlo.** Panel elevado sobre barra elevada (dos sombras), caja del texto de Instagram adentro, fechas como 4 radios con borde. En subida a mano, los pasos van rotulados como meta. | I, D, U | `video-elegir-fecha.png`, `video-programado-sin-instagram.png` |
| 16 | Media | **Ajustes repite y mezcla.** El estado de las 4 cuentas aparece dos veces («Conectar Instagram» dos veces, 9 «Falta»); llaves de API y saldo de API al mismo nivel que las preferencias de Coni; 6 tipos de control; 2,7 pantallas. | I, D, U | `ajustes-configurando.png` |
| 17 | Media | **Ideas.** Con «Por qué» abierto, «Después» y «Usar esta» quedan bajo el pliegue; carta teñida con hueco de 90 px; «Respaldo débil» y «Evidencia: Media» como chips; Buscar con 11 chips en 3 filas; idea propia en 5 filas con borde. | I, D, U | `ideas-por-que.png`, `ideas-buscar.png` |
| 18 | Media | **Ayuda centrada y zigzag donde se decide gastar.** 19 `text-center`; la barra de grabación alterna ancho completo y centrado en siete elementos. | D, U | `guion-aprobado-con-voz.png` |
| 19 | Media | **Toast.** A 96 px del borde tapa «Llegó una consulta» justo donde estaba el dedo; dura 4,5 s, poco para encontrar «Deshacer» entre pacientes. | I, U | `inicio-consulta-anotada.png` |
| 20 | Media | **Controles de plantilla.** Checkbox, select, hora y radios nativos sin diseñar junto a chips, segmentado y deslizador propios; casillas a la derecha para encender o apagar; Lucide con todo redondeado. | D, I | `ajustes.png`, `ideas-propia-propuesta.png` |
| 21 | Baja | **"Trabajando" parece barra vacía.** Barra gris estática bajo filas en curso. | I, D, U | `inicio-escribiendo-guiones.png` |
| 22 | Baja | **Ingreso.** Sin marca; el error se dice tres veces en rojo; «Mandar otro código» es lo más débil tras un código malo. | D, U, I | `ingreso-codigo-error.png` |
| 23 | Baja | **Calendario.** Días y «Próximos» no tocables, puntos de color sin leyenda; Ritmo con «Autoestima» desbordada, 9 cajas punteadas y «van 2 de 2» poco claro; segmentado sin pista visible. | I, D, U | `calendario-ritmo.png`, `calendario-mes.png` |
| 24 | Baja | **Estados finales planos.** «Ya se publicó» es una caja verde como cualquier otra, sin fecha ni video; en error de producción el reproductor dice «Escucha cómo suena antes de grabar». | D, I, U | `video-publicado.png`, `guion-error-produccion.png` |
| 25 | Baja | **Semillas e2e.** Avatares "huevo" y degradados en las capturas: no son del producto y no pueden llegar a los mockups. | D | `guion-por-aprobar.png` |

---

## 2. Conflictos entre auditores y decisión

| # | Tema | Posiciones | Decisión y por qué |
|---|---|---|---|
| C1 | **Acento** | D: se queda la frambuesa (bajada a `#a8285a`). I: acento "lejos del rojo de error". U: el problema es la cantidad de papeles, no el tono. | **Se queda la frambuesa `#a8285a` y se reduce a un solo papel: la firma.** Es la marca de Coni y vive en `/l`. El error se mueve a `#b3261e` (oklch 29° frente a 2° del acento) y nunca rellena: siempre texto más ícono. Como la frambuesa ya no aparece en ningún error ni en ningún botón común, no hay con qué confundirla. |
| C2 | **Dónde vive el acento** | D: deslizador, pestaña activa, foco y fecha. U: acción principal, deslizador y estado activo. I: esa acción y el estado actual. | **Solo en la firma:** el deslizador de las dos puertas y la fecha a la que compromete («sale el …»). Botones principales, pestaña activa, selección, hoy y foco van en tinta. La regla más estricta es la única que resiste: con 2 o 3 papeles extra la frambuesa vuelve a significar "cualquier cosa". En una interfaz casi monocroma, ese único punto de color es toda la marca. |
| C3 | **Neutros** | D: casi grises con matiz 300 (`#f6f5f6`). I: papel o piedra tibia, croma 0,005 a 0,01. | **Piedra tibia, croma 0,003 a 0,015, matiz 77 a 91.** El matiz 300 sigue en la familia rosa y violeta (morado IA a un paso). PRODUCT pide calidez, y con croma tan bajo se lee moderno, no beige de spa. |
| C4 | **Familia** | D: Satoshi (Geist lee "herramienta técnica"). I: Geist o Satoshi. U: cualquiera de las cuatro. | **Satoshi** (400, 500 y 700). Precondición para el primer mockup: «» ¿ ¡ ñ, tildes y cifras tabulares. Si algo falla, se usa Geist completo, sin mezclar familias. |
| C5 | **Escala** | I: 15 / 18 / 22 / 28 / 36. D: 15 / 18 / 20 / 24 / 32. U: 5 tamaños como máximo. | **15 / 18 / 20 / 24 / 32.** El paso de 18 a 20 no ordena jerarquía: es el papel del guion (lectura larga, interlínea 1,6), distinto por función. Todo lo demás salta 1,2 o más. |
| C6 | **Radios** | D: 14 y píldora solo en el deslizador. I: dos radios. | **12 px y círculo.** El círculo solo va en lo que es redondo por naturaleza: el deslizador, las casillas y el interruptor. |
| C7 | **Panel del video** | D: una sola hoja elevada con revisión, texto, fecha y deslizador. I: el panel es una elevación válida. U: la única superficie elevada es la barra de firma. | **La revisión fluye plana en la página y solo la barra de firma se eleva.** Una hoja con todo adentro tapa el video y repite el problema del #1, y el panel encima de la barra es justo la doble sombra que critican. |
| C8 | **Carta de idea** | D e inventario: la única superficie elevada de su pantalla. U: una superficie por pantalla. | **Sí, la carta se eleva.** Ideas no tiene barra de firma, así que la carta es su única superficie: neutra, sin tinte, del alto de su contenido. |
| C9 | **Avisos en Inicio** | I y U: duplican las firmas. D: fusionar es decisión de producto. | **En el mockup**, un aviso que apunta a una pieza que ya está en «Necesita tu firma» se muestra como marca de no leído en esa fila; los demás quedan como líneas arriba. **Se marca para Federico** (sección 7). |
| C10 | **Navegación** | U: quizás pestañas para Ideas y Calendario (por confirmar). I y D: sin pestaña activa. | **Quedan 3 pestañas** (la arquitectura no cambia) e **Inicio se marca activa en `/ideas` y `/calendario`**, porque cuelgan de ella. Las 4 pestañas quedan como variante solo si Federico la pide. |
| C11 | **Toque que aprueba** | Solo U lo detectó (Alta, falta probar en iPhone). | **Sube a Crítica y es no negociable:** tocar la pista no hace nada y solo arrastrar el pulgar aprueba. Para WCAG 2.5.7, la alternativa sin arrastre (tocar el pulgar y confirmar en línea) queda por confirmar. |
| C12 | **Pilar** | I: palabra y, como mucho, un punto de baja saturación. U: palabra con punto. D: palabra, sin color. | **Solo la palabra, en tinta apagada.** Cinco tonos de punto violan la regla de un acento y vuelven a chocar con los estados. El nombre ya va siempre escrito. |
| C13 | **Grabar voz y video** | Las tres: dos principales iguales. | **Una sola principal: la que sigue.** Sin voz, «Grabar voz» (escuchar antes cuesta lo mismo: US$ 0,20 + 1,16 = 1,36). Con voz, «Grabar video». La otra va en contorno, con su costo. |
| C14 | **Video "a sangre"** | D y U conservan el 9:16 a sangre. I y U piden el play visible. | **Gana el play visible.** El 9:16 se dimensiona al alto disponible (`100dvh` menos el volver, la barra de firma y la safe area), a sangre solo si cabe. Los controles van dentro del video: play al centro, avance arrastrable sobre el degradado oscuro y tocar en cualquier parte para reproducir o pausar. El título va bajo el video. Validar en 390×844. |
| C15 | **Marcas de tono al editar** | D: resaltarlas en un `textarea` cuesta una capa o `contenteditable`. | **En el mockup:** en lectura, fichas apagadas; al editar, texto plano con la misma letra. La capa queda como decisión de implementación posterior. |
| C16 | **Encabezado de Inicio** | I: el resumen debe ser lo más visible. D: conservar el copy del encabezado. | **El copy se queda y se invierte la jerarquía:** «2 cosas esperan tu firma · unos 6 min» pasa a título de 32; «Semana del…» y «Hola, Coni» van como línea de 15 arriba. |
| C17 | **Métricas** | I: conclusión arriba. D: las 3 a 5 primeras y "ver todas". U: «Semana a semana» duplica. | **Compatibles:** comparación arriba, luego las 5 primeras de «Lo que sirvió», el resto plegado y «Semana a semana» plegada bajo su propio rótulo. |
| C18 | **Toast** | I: 4,5 s es corto (WCAG 2.2.1). U: tapa el último botón. | **8 s como mínimo, sobre la barra inferior** con 12 px de aire, sin tapar nunca el control que se acaba de tocar. |

---

## 3. No negociables (el rediseño cambia la forma, nunca esto)

**Las dos puertas**
- Puerta 1: Coni aprueba el guion (gratis). Puerta 2: aprueba el video y la fecha. Nada se publica
  sin las dos. Grabar va entre ambas, y solo después de la puerta 1.
- La puerta 2 exige ver el video completo («Míralo completo para aprobar» → «Lo viste completo») y
  marcar «Revisé labios, nombre, subtítulos y cortes».
- Lo aprobado se ve completo y tal como sale: el guion entero, sin scroll interno; el video 9:16 con
  «Avatar IA»; el texto «Así sale en Instagram» tal cual, con «Video hecho con mi avatar digital.».
- «Si lo apruebas hoy, sale el jueves 8 de octubre · 19:00» se ve antes de firmar.
- La etiqueta «Información de IA» sigue siendo requisito para «Ya lo subí» en la subida a mano.

**Firmar con seguridad**
- Deslizar es el único gesto que aprueba, en las dos puertas.
- Ningún toque aprueba: solo el arrastre del pulgar. Esto se prueba en el iPhone de Coni antes de
  cerrar el diseño.
- Deshabilitado se ve deshabilitado (pulgar en contorno, sin relleno) y su motivo va escrito, uno a
  la vez, legible (no apagado chico).
- Un solo control de firma por pantalla. Ningún otro botón lleno compite con él.
- La frambuesa no aparece en nada más, para que la firma sea inconfundible.

**Costos claros**
- Costo y saldo junto a cada botón que gasta, alineados a la izquierda y con cifras tabulares.
- Los bloqueos (saldo, tope) se ven como aviso con ícono y letra de cuerpo, no como letra gris
  centrada.
- Hay confirmación antes de grabar el video («¿Grabar el video? Cuesta unos US$ 1,36.»), y la línea
  de costo va antes de la confirmación, no después.
- El gasto del mes se ve: al acercarse al tope (80 %) cambia a tono de aviso.

**Lo destructivo**
- Nunca va en botón lleno ni en frambuesa. Se escribe en tinta de error y se confirma en línea
  (descartar pieza, pedir cambios, regrabar) o se puede deshacer (descartar idea).
- Si una acción gasta y además descarta («Sí, regrabar»), manda el trato destructivo.

**Accesibilidad y copy**
- WCAG 2.2 AA en todo par de colores y bordes de campo a 3:1. Base de 18 px, botones de 52 px,
  objetivos de 44 px o más. Dynamic Type, reducir movimiento y safe areas. El color nunca va solo:
  todo estado lleva texto o ícono.
- Tema claro, por la escena diurna. Los tokens quedan listos para un modo oscuro posterior.
- El copy no se toca: tú, español de Chile, frases cortas, «avísale a Federico» como salida. Sin
  rayas largas. Todo texto nuevo que exija el rediseño se marca y se confirma (sección 7).
- Se conservan los esqueletos en vez de spinners, los toasts con «Deshacer», los Ajustes que se
  guardan solos y el tamaño de muestra en cada número de Métricas.

---

## 4. Brief de diseño: Conidolly, muy minimalista y moderna

**Idea en una frase:** una hoja tranquila en tinta sobre piedra, donde lo único de color es la firma
de Coni.

1. **La frambuesa es la firma.** La interfaz es casi monocroma: neutros de piedra tibia y tinta. La
   frambuesa (`#a8285a`) aparece en un solo lugar: el deslizador de las dos puertas y la fecha que
   compromete («sale el …»). Botones, pestaña activa, selección, hoy y foco van en tinta. Error, éxito
   y aviso son texto con ícono en su propia tinta, nunca fondos. El pilar es una palabra, no un color.
2. **Una letra, cinco tamaños.** Satoshi en 400, 500 y 700. Escala de 15, 18, 20, 24 y 32: meta,
   cuerpo, guion, título de pieza y título de pantalla. La jerarquía sale del tamaño, el peso y la
   tinta. Cifras tabulares para plata, horas y métricas. El guion usa la misma letra al editar y al
   leer.
3. **Espacio y líneas, no cajas.** Se agrupa con aire (escala de 4: 8, 12, 16, 24, 32, 48; margen
   lateral de 20) y líneas de 1 px. Hay como máximo una superficie elevada por pantalla: la barra de
   firma, la carta de idea o el toast. Nunca una dentro de otra. Dos radios: 12 px y círculo.
4. **Lo que se firma va primero y completo.** El guion se lee como documento a todo su alto, sin
   scroll interno. El video muestra el play al cargar y se toca para reproducir o adelantar. El texto
   de Instagram va tal cual. En Inicio, el título es lo que espera la firma. En Métricas, la
   conclusión va arriba.
5. **La barra de abajo trae el siguiente paso, y nada más.** Mide 112 px o menos más la safe area:
   una acción (el deslizador o la única principal) y una línea (el motivo, o el costo con el saldo).
   «Pedir cambios», «Regrabar» y «Volver a revisar el guion» viven en el flujo, no en la barra. Ya
   aprobado el guion, la barra trae «Grabar voz» o «Grabar video», sin obligar a releer todo.
6. **Una principal por vista.** La principal es tinta llena de 52 px; la secundaria, contorno a 3:1;
   la terciaria, texto en tinta. Nada se centra salvo la etiqueta del deslizador. Ayudas, costos y
   motivos van alineados a la izquierda, en la columna de lectura.
7. **Lo que cuesta o borra se nota y se frena.** El costo va a la derecha de su acción y el saldo
   debajo, en una línea. Un bloqueo es una línea de aviso con ícono a tamaño de cuerpo. Lo
   destructivo es texto en tinta de error, con confirmación en línea o «Deshacer». Confirmar un gasto
   nunca usa el color de la firma.
8. **Firmar es deliberado.** Solo se aprueba arrastrando el pulgar; tocar la pista no hace nada.
   Deshabilitado, el pulgar va en contorno y el motivo va escrito en tinta con ícono. Al aprobar, el
   pulgar llega al final y el estado se escribe. Con reducir movimiento no hay animación, pero el
   gesto sigue igual.
9. **El mismo esqueleto en todos los estados.** Toda pantalla de pieza tiene «‹ Inicio» arriba, una
   línea de meta (pilar · formato · duración), el título a 24, una línea de estado con ícono, el
   cuerpo y la barra. Cambiar de estado cambia la línea de estado y la acción, no el diseño. Hay una
   sola forma de volver. Inicio queda activa en Ideas y Calendario.
10. **Un control para cada cosa, como iOS.** Casilla redonda propia, interruptor para encender y
    apagar, filas de lista con el valor a la derecha (hora, fecha, pilar, con el selector nativo
    detrás) y un solo tipo de chip neutro. Íconos Phosphor de un solo peso, solo cuando suman
    significado.
11. **Calma predecible.** Cada dato aparece una vez por pantalla, cada cosa tiene un lugar fijo y los
    estados van siempre escritos. "Trabajando" es una línea de texto con un punto que late (quieto
    con reducir movimiento). El toast dura 8 s, flota sobre la barra y nunca tapa lo que se acaba de
    tocar.
12. **La calidez es real, no decoración.** La dan las fotos reales de los looks del avatar, el video,
    la voz de Coni en el copy y un «Ya se publicó» que se siente como un momento tranquilo. No hay
    pasteles, degradados de adorno, ilustraciones, glow, vidrio ni morado. El movimiento solo responde
    al toque: 150 a 220 ms, sobre `transform` y `opacity`.

---

## 5. Sistema base para los mockups

### 5.1 Color (contrastes WCAG 2.x calculados en esta síntesis)

| Token | Valor | oklch (L, C, H) | Contraste | Uso |
|---|---|---|---|---|
| `fondo` | `#f7f6f3` | 0,973 · 0,004 · 91 | - | página |
| `superficie` | `#fcfbf9` | 0,988 · 0,003 · 85 | 1,05:1 vs fondo (necesita línea o sombra) | barra de firma, carta de idea, campos |
| `tinta` | `#1d1b18` | 0,223 · 0,006 · 78 | 15,9:1 vs fondo | texto, principal llena, selección, pestaña activa, foco, hoy |
| `apagado` | `#69645d` | 0,506 · 0,013 · 77 | 5,43:1 vs fondo · 4,79:1 vs pista | meta, ayuda, pilar |
| `linea` | `#e5e2dc` | 0,913 · 0,009 · 85 | 1,20:1 (decorativa) | separadores, borde de la carta |
| `campo` | `#8a847b` | 0,616 · 0,015 · 78 | 3,43:1 vs fondo · 3,58:1 vs superficie | contorno de campos, casillas, secundaria, deshabilitado |
| `pista` | `#ebe8e2` | 0,932 · 0,009 · 85 | 1,13:1 vs fondo | pista del deslizador, esqueletos |
| `firma` (acento) | `#a8285a` | 0,495 · 0,167 · 2 | 6,24:1 vs fondo · 5,51:1 vs pista · superficie sobre ella 6,52:1 | solo pulgar y relleno del deslizador, y la fecha de «sale el» |
| `error` | `#b3261e` | 0,501 · 0,178 · 29 | 6,05:1 | texto e ícono de error, texto destructivo |
| `exito` | `#2e6a44` | 0,473 · 0,088 · 154 | 5,96:1 | texto e ícono de éxito |
| `aviso` | `#7d5410` | 0,479 · 0,095 · 74 | 6,17:1 | texto e ícono de aviso y bloqueo |

- La frambuesa tiene 62 % de saturación HSL (bajo el 80 %) y es el único acento. Ocupa menos del
  2 % de la superficie de cualquier pantalla.
- Ningún `#000` ni `#fff`. Sombra única, solo en la superficie elevada:
  `0 -1px 0 linea, 0 -8px 24px rgb(29 27 24 / 0.06)` (barra) y su versión hacia abajo para la carta
  y el toast.
- `/l` (registro de marca) puede seguir con la frambuesa a sangre y Satoshi.

### 5.2 Tipografía

| Rol | Tamaño / interlínea | Peso | Notas |
|---|---|---|---|
| Título de pantalla | 32 / 1,15 | 700 | tracking -0,02em. Inicio, Ideas, «Octubre», Ajustes |
| Título de pieza, gancho de idea | 24 / 1,2 | 700 | igual en Guion y Video |
| Guion | 20 / 1,6 | 400 | misma cara al editar y al leer; las marcas `[warm]` en 15 apagado al leer |
| Cuerpo, filas, botones | 18 / 1,45 | 400 · 600 en títulos de fila y botones | base de accesibilidad |
| Meta, rótulos, ayuda | 15 / 1,4 | 500 | los rótulos de sección van en tinta 600, no apagados |

Satoshi desde Fontshare en los mockups (en producción, `next/font/local`), con
`font-variant-numeric: tabular-nums` en plata, horas y métricas.

### 5.3 Forma, espacio, elevación y movimiento
- Radios de 12 px (botones, campos, video, carta, toast, foto de avatar) y círculo (deslizador,
  casillas, interruptor).
- Espacio en escala de 4: 4, 8, 12, 16, 24, 32, 48. Margen lateral de 20. Entre secciones, 32 a 40.
  Filas de 56 a 64 px de alto.
- Superficies elevadas permitidas: la barra de firma (Guion, Video), la carta de idea y el toast.
  Nada más.
- Movimiento de 150 a 220 ms, con `ease-out` al entrar, solo en `transform` y `opacity`. Se apaga
  con reducir movimiento.

### 5.4 Componentes
- **Deslizador:** pista de 56 px en `pista`, pulgar de 48 px en `firma` con flecha en `superficie`,
  etiqueta de 18/600 en tinta. Deshabilitado: pulgar en contorno `campo` sin relleno y etiqueta
  apagada. Debajo, el motivo en 15/600 tinta con ícono.
- **Botones:** la principal es tinta llena con texto en superficie, 52 px. La secundaria es contorno
  `campo` con texto en tinta. La terciaria es texto 600 en tinta, con objetivo de 44. La destructiva
  es texto 600 en `error`, y su confirmación va en contorno `error`.
- **Línea de estado (reemplaza a la `Nota`):** ícono de 20 y texto de 18 en la tinta del estado,
  más un detalle de 15 en tinta. Sin fondo y sin borde lateral, puesta donde ocurre.
- **Confirmación en línea:** reemplaza el contenido de la barra o de la fila, sin caja teñida: la
  frase de 18 (con el costo si lo hay), la acción y «Volver».
- **Fila de pieza (se conserva):** título 18/600; estado en una línea de 15; el pilar como palabra
  apagada en su propia línea; chevron. Marca de no leído: un punto de tinta de 8 px a la izquierda.
- **Selección:** casilla redonda de 24 px (marcada, tinta llena con check). Fechas, pilar y motivos
  como filas con un check a la derecha. Avatar como foto 3:4 de radio 12; marcado, con anillo de
  2 px en tinta y check.
- **Chip único:** 15/500, contorno `campo`; seleccionado, tinta llena. Se usa solo en los filtros de
  Buscar y en los días de publicación (7 segmentos en una fila).
- **Pestañas de vista** (Mes · Agenda · Ritmo): texto con subrayado de 2 px en tinta en la activa.
  Sin caja.
- **Navegación inferior:** 3 pestañas con íconos Phosphor y etiquetas de 15. La activa en tinta
  700 con un indicador; las inactivas, apagadas.
- **Toast:** tinta llena, texto en `fondo` de 18, «Deshacer» en 600 subrayado. Dura 8 s y flota a
  12 px sobre la barra.

---

## 6. Dirección por pantalla (para los mockups)

- **Ingreso:** «Conidolly» chico arriba, «Hola, Coni», casillas con contorno a 3:1. El error va en
  una sola línea con ícono bajo las casillas, y «Mandar otro código» pasa a secundaria visible cuando
  hay error.
- **Inicio:** arriba, una línea de 15 con «Semana del…» y «Hola, Coni»; el título de 32 es el
  resumen. Luego, las líneas de estado de las piezas con problema (sin cajas), «Necesita tu firma» (y
  sus avisos como marca de no leído), «En camino» («Programado» se puede tocar), «Para subir» e
  «Ideas de la semana» como lista plana con casilla redonda y la principal «Escribir N guiones».
  «Consultas» va en una fila con el número y «Llegó una consulta». «Ver calendario» y «Ver todas las
  ideas» pasan a filas de navegación, no a botones sueltos.
- **Ideas:** la carta neutra es la única superficie, con el pilar (palabra), el gancho de 24 y la
  meta. «Después» y «Usar esta» van justo bajo el gancho, de modo que «Por qué» se abre hacia abajo
  sin empujarlos. «Por qué» lleva chevron. «Descartar» es texto destructivo con sus motivos como
  filas con check y un «Deshacer». Buscar es un botón de ícono y los filtros son chips en una fila
  con scroll lateral.
- **Guion por aprobar:** volver, meta, título de 24, «Si lo apruebas hoy, sale el …» con la fecha en
  frambuesa. Después, el guion a todo su alto en 20/1,6, con el contador y su «Bien» en una línea.
  Con cambios sin guardar, la barra cambia el deslizador por «Guardar cambios» y el motivo «Guarda
  tus cambios antes de aprobar». Siguen el texto de la publicación (con su rótulo), el avatar en
  fotos, la revisión como líneas con casilla y, al final del flujo, «Pedir cambios» como texto
  destructivo. La ayuda de marcas queda plegada.
- **Guion aprobado:** el mismo esqueleto, el guion en lectura con la misma letra y el reproductor de
  voz arriba. La barra trae la siguiente grabación (voz o video) con su costo a la derecha y el saldo
  debajo. La otra grabación va en el flujo, en contorno, con su costo. Los bloqueos van como línea de
  aviso.
- **Video por aprobar:** volver, y el video 9:16 al alto que quepa sobre la barra, con «Avatar IA»,
  play al centro, avance arrastrable y tocar para pausar. Debajo, el título, la meta, «Lo viste
  completo» y «Ver zonas de Instagram». Después de verlo, todo en flujo plano: la casilla de
  revisión, «Así sale en Instagram» (texto tal cual con «Editar el texto»), la fecha como fila con
  «Cambiar» (las opciones como filas con check) y «Regrabar» como texto destructivo. La barra solo
  lleva el deslizador y su motivo.
- **Estados sencillos y finales:** el mismo esqueleto, con la línea de estado en lugar de la caja y
  sin «Volver a Inicio» abajo. «Descartar esta pieza» siempre como texto destructivo con
  confirmación. La subida a mano va en 4 pasos numerados como contenido (no como meta). «Ya se
  publicó» es un momento tranquilo: check grande, título y el video en miniatura.
- **Calendario:** un rótulo de 15 «Calendario» sobre «Octubre» (reusa copy existente) y Mes, Agenda
  y Ritmo con subrayado. En Mes, un punto de tinta por día con publicación, hoy en círculo de tinta y
  días tocables. La Agenda es una lista plana con la columna de la hora, el título, la palabra del
  pilar y el estado escrito con ícono; «Libre · elige una idea» va como línea callada. En Ritmo, las
  marcas llenas van en tinta y las vacías en línea fina, con la primera palabra del pilar sin
  desbordarse.
- **Métricas:** un rótulo «Métricas» sobre «Octubre» y el resumen. Después, la comparación en texto
  (los 8 segmentos en tinta) y «Lo que sirvió» con las 5 primeras: el número de 24 tabular, la barra
  en tinta sin pista y la muestra en una línea. El resto y «Semana a semana» van plegados.
- **Ajustes:** listas planas al estilo de iOS. Arriba, lo de Coni: días (7 segmentos), hora (fila
  con el valor), tope con «Llevas…» y un medidor fino que pasa a aviso desde el 80 %, y los avisos
  del celular con interruptores. El bloque de estado aparece solo mientras falte algo y nunca repite
  las cuentas. «Cuentas conectadas» es una fila que abre su propio nivel (llaves, saldo de API y su
  explicación). «Cerrar sesión» va en tinta, al final.

---

## 7. Por confirmar con Federico (flujo o copy, no forma)

1. Cómo se comporta el deslizador en el iPhone de Coni (WebKit), y la alternativa sin arrastre para
   WCAG 2.5.7 (tocar el pulgar y confirmar en línea) sin perder la firma deliberada.
2. Fusionar los avisos de Inicio que apuntan a una pieza que ya está en «Necesita tu firma» (C9).
3. Copy nuevo que exige el rediseño: la confirmación de «Descartar esta pieza», el «Ver todas» de
   Métricas y la fecha en «Ya se publicó» (hay que ver si el dato existe).
4. «Pedir cambios» sin un campo para decir qué cambiar: ¿es intencional?
5. La lógica de «van 2 de 2» en Ritmo frente a la tabla, y el título «Octubre» sobre semanas de
   septiembre.
6. Que la hora se vea en formato de 24 horas en iOS es-CL («19:00» y no «07:00 PM»).
7. Las inconsistencias de copy de `inventario.md` 15.2: lunes 8:00 frente a domingo 20:00, dos
   textos del tope y el motivo sin punto final. Dos vocabularios de evidencia en Ideas («Respaldo
   débil» frente a «Evidencia: Media»).
8. Si Ideas y Calendario merecen pestaña propia (la decisión por defecto es que no: C10).

---

## 8. Verificaciones hechas en esta síntesis

- `components/deslizar-para-aprobar.tsx`: `input type="range"`, `UMBRAL_DE_APROBACION = 96`.
  `alMover(nuevo >= 96)` llama a `aprobar()` sin exigir arrastre, así que el toque en la pista que
  reportó U es posible por diseño.
- `components/reproductor-video.tsx:27`: `w-[min(100%,calc(88dvh*9/16))]`. El único `onClick` está
  en el botón (línea 62), no en el `<video>`.
- `app/(app)/estado-de-pieza.tsx:45`: `variante={indice === 0 ? "primario" : "callado"}`. Cuando
  «Descartar esta pieza» es la única acción, sale como principal.
- `video-por-aprobar-pantalla.png`: la barra fija parte cerca de los 664 px CSS y el video sigue
  bajo ella, sin controles a la vista.
- La paleta de 5.1 se calculó con la fórmula WCAG 2.x y la conversión a oklch. Todos los textos
  pasan AA y los contornos de control pasan 3:1.
- Sin verificar: el comportamiento en WebKit (iPhone) y la cobertura de glifos y cifras tabulares
  de Satoshi (C4).
