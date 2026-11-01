# Conidolly: inventario de pantallas, estados y contenido

> Especificación que los mockups del rediseño deben seguir. Cambia la forma, no el contenido: todo
> texto entre comillas «» o en `código` es copy real de la app y se mantiene tal cual (tú, español
> de Chile, sin raya larga). Fuente: código de `~/Projects/estudio-coni` leído el 4 de octubre de
> 2026 (`app/(app)/**`, `app/ingreso`, `components/**`, `lib/datos/*.ts` y los modelos que estos
> usan: `lib/inicio/modelo.ts`, `lib/calendario/modelo.ts`, `lib/metricas/modelo.ts`,
> `lib/ajustes/*`, `lib/dominio/*`). Los valores de ejemplo vienen de las semillas de `tests/e2e/*`.
> Cuando el código contradice `docs/DESIGN.md`, manda el código.

## Índice

0. Contexto y "hoy" de los mockups
1. Shell de la app (layout, navegación, estados globales)
2. Ingreso
3. Inicio
4. Ideas (banco, buscar, idea propia)
5. Guion/[id] (puerta 1 y grabación)
6. Video/[id] (puerta 2 y estados posteriores)
7. Calendario (Mes, Agenda, Ritmo)
8. Métricas
9. Ajustes
10. Anexo: página pública `/l` y avisos push
11. Mapa de navegación y ciclo de vida de una pieza
12. Tokens de diseño actuales
13. Componentes compartidos actuales
14. Datos de ejemplo canónicos para los mockups
15. Observaciones para el rediseño (riesgos, inconsistencias, por confirmar)

---

## 0. Contexto

- **Usuaria única:** Coni del Rosario, psicóloga clínica y sexóloga. No es técnica. Usa la app
  instalada como PWA en su iPhone, entre pacientes, unos 14 minutos a la semana. Texto base de
  18 px y botones de 52 px son decisiones de accesibilidad de `PRODUCT.md`, no de estilo.
- **Dos puertas humanas:** puerta 1 = aprobar el guion (deslizar), después grabar voz y video
  (gastan saldo); puerta 2 = aprobar video y fecha (deslizar). Nada se publica sin las dos.
- **Un solo gesto de aprobación:** deslizar (control de rango nativo, aprueba al 96 %), en ambas
  puertas. Las listas nunca tienen botón de aprobar: aprobar ocurre en la pantalla de detalle.
- **"Hoy" sugerido para los mockups:** martes 6 de octubre de 2026, 10:30, hora de Chile. Semana:
  «Semana del 5 al 11 de octubre». Horario de publicación por defecto: martes, jueves y sábado a
  las 19:00 (`dias_publicacion = [2, 4, 6]`). Próximos horarios libres: jueves 8, sábado 10,
  martes 13 y jueves 15 de octubre, 19:00.

Formatos de fecha que usa toda la app (`lib/dominio/fechas.ts`):
- larga: `jueves 8 de octubre · 19:00`
- corta: `jueves 8 · 19:00`
- semana: `5 al 11 de octubre` o `28 de septiembre al 4 de octubre`
- dinero: `US$ 2,40` (coma decimal, `es-CL`); miles con punto: `100.000`
- duración del reproductor: `0:52`

---

## 1. Shell de la app

### 1.1 Layout `(app)` (todas las pantallas con sesión)

- Una columna centrada, `max-width: 560px`, margen lateral 18 px (`px-4.5`), padding superior
  `max(16px, safe-area-inset-top)`, inferior 24 px. Mismo layout en tablet o computador; ahí la
  barra de navegación pasa arriba.
- Orden: barra sin conexión (si aplica) → contenido → navegación inferior.
- Sesión: sin sesión redirige a `/ingreso`; si entra otra persona, ve "Solo para Coni" (1.6).

### 1.2 Navegación inferior (`components/nav-inferior.tsx`)

- Tres pestañas con ícono (lucide, 22 px, trazo 1,8) y texto debajo:
  `Inicio` (House) · `Métricas` (ChartColumn) · `Ajustes` (Settings).
- Fija abajo, fondo superficie, borde superior 1 px, respeta safe-area. Altura mínima de cada
  pestaña 48 px.
- Activa: texto e ícono en acento, semibold. Inactivas: apagado.
- **Se oculta en `/guion/*` y `/video/*`**: ahí la barra fija de aprobar ocupa el borde inferior.
- En `/ideas` y `/calendario` la barra se ve pero **ninguna pestaña queda activa** (Inicio solo se
  marca en `/` exacto).
- No hay pestaña para Ideas ni Calendario: se llega desde Inicio.

### 1.3 Barra sin conexión (`components/barra-sin-conexion.tsx`)

- Solo cuando el navegador está offline. Franja de ancho completo arriba del contenido, fondo de
  advertencia, texto centrado semibold 15 px: «Sin conexión. Aprueba cuando vuelva.»

### 1.4 Cargando (`app/(app)/loading.tsx`)

- Esqueleto, nunca spinner: dos barras de encabezado (1/3 y 1/2 de ancho) y tres filas de lista
  (barra 4/5 + barra 3/5, separador). Animación: pulso lento de opacidad (1,6 s); sin animación con
  "reducir movimiento".

### 1.5 Error de pantalla (`app/(app)/error.tsx`)

- Bloque con fondo de error y `role=alert`:
  - «No pude cargar esta pantalla.» (semibold, color tinta)
  - «Puede ser la conexión. Si sigue pasando, avísale a Federico.»
  - Botón línea: «Intentar de nuevo»

### 1.6 Solo para Coni (`app/(app)/solo-para-coni.tsx`)

- Cualquier otra cuenta que entre (incluido el mantenedor) ve solo:
  - Título display: «Esta app es solo para Coni.»
  - Botón línea: «Salir»
- Sin navegación.

### 1.7 Toast / aviso flotante (`components/ui/aviso.tsx`)

- Fijo sobre el contenido, a 96 px del borde inferior (encima de la nav), márgenes 14 px, ancho
  máximo 532 px. Fondo tinta, texto fondo 16 px, sombra flotante. Entra con 8 px de subida y fundido
  (220 ms). Desaparece a los 4,5 s.
- Botón opcional a la derecha «Deshacer» (44 px de alto, semibold, color acento claro), solo
  cuando la acción se puede deshacer.

### 1.8 Refresco automático

- Invisible. Mientras algo trabaja (escribiendo guion, grabando voz, grabando video) la pantalla se
  vuelve a pedir sola cada 8 s en Inicio y cada 4 s en Guion. Los mockups pueden mostrar el estado
  "trabajando" sin indicar el polling.

### 1.9 Página 404

- No hay `not-found` propio: un id inválido o inexistente cae en el 404 por defecto de Next.
  (Oportunidad: diseñarlo en el mismo lenguaje.)

---

## 2. Ingreso (`/ingreso`)

**Propósito:** entrar sin escribir correo ni contraseña. Coni es la única usuaria: el correo está
fijo y se muestra enmascarado. Sin navegación. Padding superior mayor (64 px).

### 2.1 Paso "inicio"
1. Título display: «Hola, Coni»
2. Texto apagado: «Te mando un código a **c•••@correo.cl** para que entres.» (el correo enmascarado
   va en semibold color tinta; formato: primera letra + `•••@dominio`)
3. Error (si hubo): caja de error con el mensaje.
4. Botón principal ancho completo: «Mandarme el código» (estado cargando al tocar)

### 2.2 Paso "código"
1. Título display: «Entra con el código que te mandé»
2. Texto apagado: «Lo envié a c•••@correo.cl. Vence en 1 hora. Si no llega, mira la carpeta de spam.»
3. Seis casillas de un dígito en una fila (grid de 6, separación 8 px, proporción 0,82, número
   24 px semibold tabular). Teclado numérico; la primera tiene `autocomplete=one-time-code`;
   pegar el código llena las seis; al completar las seis se envía solo. Borde rojo si el código
   falló. Etiqueta para lector: «Código de 6 números», cada casilla «Número 1 de 6».
4. Error (si hubo): caja de error.
5. Confirmación (tras reenviar): caja de éxito «Te mandé otro código.»
6. Botón principal: «Entrar» (deshabilitado hasta tener 6 dígitos; cargando al enviar)
7. Botón callado: «Mandar otro código»

### 2.3 Mensajes de error posibles
- «No pude mandar el código. Inténtalo de nuevo en un rato.»
- «Espera 42 segundos para pedir otro código.» / «Espera un momento para pedir otro código.»
- «El código tiene seis números.»
- «Ese código no sirve o ya venció. Pide otro.» (limpia las casillas)
- «Demasiados intentos. Espera un momento y pide otro código.»
- «No pude revisar el código. Inténtalo de nuevo en un rato.»

**Navegación:** código correcto → redirige a `/` (Inicio).

---

## 3. Inicio (`/`)

**Propósito:** la bandeja de la semana. Solo lo que necesita su firma arriba; el resto es
profundidad opcional. Dirección vigente: "lista serena", sin tarjetas (salvo el bloque de ideas).

### 3.1 Elementos en orden (estado completo)

1. **Encabezado**
   - Meta apagada: «Semana del 5 al 11 de octubre»
   - Título display: «Hola, Coni»
   - Resumen apagado 17 px: «2 cosas esperan tu firma · unos 6 min»
     (variantes: «Una cosa espera tu firma · unos 3 min», «Esta semana está al día»; 3 min por firma)
2. **Notas de piezas** (0 a n, una por pieza con problema o celebración; ver 3.3)
3. **Sección «Avisos»** (solo si hay avisos sin leer; máximo 5). Filas tocables, alto mínimo
   64 px, separador 1 px:
   - Mensaje 18 px semibold: «Tu guion «El deseo no se apaga, se esconde» está listo para revisar.»
   - Meta apagada: «lunes 5 · 18:42»
   - Chevron a la derecha.
   - Tocar marca el aviso como leído y abre la pieza (`/guion/id` si es guion listo, `/video/id`
     el resto, `/` si no tiene pieza). Otro ejemplo: «Ya tienes ideas nuevas para elegir esta semana.»
4. **Sección «Para subir a Instagram»** (solo si hay reels cuya hora llegó sin Instagram
   conectado). Filas de pieza (ver 13.6) con meta «Para subir · martes 6 · 19:00 · Autoestima»,
   enlazan a `/video/id`.
5. **Sección «Necesita tu firma»** (siempre)
   - Filas de pieza: punto del pilar, título semibold 18 px, meta «Guion · 52 s · Deseo y
     sexualidad» o «Video · 48 s · Autoestima», chevron. Guion → `/guion/id`; Video → `/video/id`.
   - **Vacío:** «Nada espera tu firma esta semana.» (semibold) + «El lunes a las 8:00 te propongo 5
     ideas nuevas.» (apagado) + botón línea chico «Elegir ideas ahora» (salta al ancla `#ideas`).
6. **Sección «En camino»** (solo si hay). Orden: lo que trabaja primero (sin fecha), luego lo
   programado por fecha. Meta según estado:
   - «Escribiendo el guion · te aviso» (no tocable, barra de progreso esqueleto debajo)
   - «Guion aprobado · falta grabar» (tocable → `/guion/id`)
   - «Grabando la voz · unos segundos» (no tocable, barra esqueleto)
   - «Grabando · unos 5 min · te aviso» (no tocable, barra esqueleto)
   - «Programado · jueves 8 · 19:00» (no tocable, sin chevron)
   Siempre seguido de «· Nombre del pilar».
7. **Botón línea chico:** «Ver calendario» → `/calendario`
8. **Sección «Ideas de la semana»** (ancla `#ideas`). Hoy es una caja con borde (superficie,
   radio 20, padding 16):
   - Lista de hasta 5 ideas con casilla (24 px) + gancho + píldora del pilar debajo. Ej.:
     - «¿Te achicas para que nadie se incomode?» · Autoestima
     - «Si van a discutir, siéntense del mismo lado.» · Pareja y conversación
     - «Un visto sin respuesta y ya imaginas lo peor. ¿Te pasa?» · Bienestar emocional
     - «Puedes decir que no sin dar explicaciones larguísimas.» · Género y límites
     - «¿Tu deseo se apagó o tu cuerpo está en modo alerta?» · Deseo y sexualidad
   - Error (si hubo): caja de error.
   - Botón principal: «Escribir guiones» (deshabilitado, 0 elegidas) → «Escribir 1 guion» /
     «Escribir 3 guiones».
   - Ayuda centrada apagada: «Elige al menos una idea. Puedes elegir hasta 5.» → «Puedes sumar
     hasta 2 más.» → «Llegaste al máximo de 5.» (al llegar al máximo las no marcadas se atenúan y
     se bloquean).
   - Toast tras enviar: «Escribiendo 3 guiones. Te aviso cuando estén.» Las piezas aparecen en
     «En camino» como «Escribiendo el guion · te aviso».
   - **Vacío:** «Usaste todas las ideas del banco. Escribe una idea nueva.» + botón línea chico
     «Escribir una idea» → `/ideas`.
   - Fuera de la caja: botón callado chico «Ver todas las ideas» → `/ideas`.
9. **Sección «Consultas»**
   - Semibold: «3 consultas en octubre» (variantes: «1 consulta en octubre», «Todavía ninguna en
     octubre»)
   - Botón línea grande: «Llegó una consulta» (un toque = una consulta; no se guarda nombre ni
     motivo)
   - Toast: «Anotada. Van 4 en octubre.» + «Deshacer»
   - Errores posibles: «Esa consulta ya no está.», genérico.

### 3.2 Estados de Inicio
| Estado | Qué cambia |
|---|---|
| Completo | Todo lo anterior. |
| Al día | Resumen «Esta semana está al día»; «Necesita tu firma» vacío con «Elegir ideas ahora». Sin «En camino». |
| Banco agotado | «Ideas de la semana» muestra el vacío «Usaste todas las ideas del banco...». |
| Pieza con problema | Nota de error arriba (3.3). |
| Recién publicado | Nota de éxito arriba durante 2 días (3.3). |
| Para subir a mano | Aparece la sección «Para subir a Instagram». |
| Avisos sin leer | Aparece la sección «Avisos». |
| Algo trabajando | Filas con barra esqueleto; refresco automático. |
| Cargando / error | Ver 1.4 y 1.5. |

### 3.3 Notas de piezas (bloques arriba de todo)
Bloque redondeado (radio 20, padding 16, 17 px) con título semibold en tinta, texto y un botón
chico. El error usa `role=alert`.
- **Error** (fondo error): título = título de la pieza; texto = explicación; botón línea chico:
  - «Revisar» → `/guion/id` (falla al escribir guion, falla de voz, error de producción) o
    `/video/id` (error de publicación)
  - «Revisar la frase» → `/guion/id` (HeyGen rechazó una frase)
  - «Elegir otra fecha» → `/video/id` (la hora pasó). Ej.: título «Ser tu propia diosa», texto
    «La hora aprobada pasó sin publicarse. Elige una nueva fecha.»
  - Sin explicación guardada: «Algo no salió como esperábamos con esta pieza.»
- **Publicado** (fondo éxito): título «Si van a discutir, siéntense del mismo lado se publicó hoy
  a las 19:00» (o «...se publicó el sábado 3 a las 19:00»); texto «La etiqueta de IA quedó puesta
  en Instagram.»; botón callado chico «Ver en Instagram» con ícono de enlace externo.
- **Subido a mano** (fondo éxito): título «Ser tu propia diosa: subido a mano hoy a las 19:00»;
  texto «Quedó anotado como subido por ti, con la etiqueta de IA.»; «Ver en Instagram».

**Acción principal:** abrir lo que necesita su firma. **Secundarias:** elegir ideas y escribir
guiones, anotar consulta, ver calendario, ver banco.

---

## 4. Ideas (`/ideas`)

**Propósito:** el banco de ideas, una a la vez, para sumar a las ideas de la semana, aplazar,
descartar con motivo, buscar o escribir una propia. Tiene tres vistas en la misma ruta (estado del
cliente): mazo, buscar, idea propia.

### 4.1 Encabezado (mazo y buscar)
- Enlace atrás «‹ Inicio» (chevron + texto, acento, 44 px)
- Fila: título 24 px «Ideas» (o «Buscar ideas») + botón línea chico a la derecha «Buscar» con ícono de lupa a la izquierda
  (en la vista buscar el botón dice «Una a la vez», sin ícono)

### 4.2 Vista mazo (por defecto)
1. Rótulo acento semibold «Nuevas de la semana» (solo si la idea actual es del motor de esta semana)
2. Meta apagada: «Idea 1 de 3» (anunciada al lector)
3. **Carta de idea** (fondo = tinte del pilar, radio 24, padding 22/20, alto mínimo 340 px,
   contenido repartido arriba y abajo):
   - Arriba: píldora del pilar (tinte fuerte) «Pareja y conversación»; gancho como título display
     «Estar cansada no siempre es cansancio.»; tema (17 px, tinta del pilar) si existe.
   - Abajo: meta «Fuerza alta · Mito o realidad»; chips de respaldo débil «Respaldo débil»;
     desplegable «Por qué» (ver abajo); chips de alerta «Verificar dato» + desplegable «Qué revisar
     antes de grabar» con lista «verificar dato: La fuente cita proxémica sin estudio.»; si ya fue
     sumada: «Ya está en las ideas de la semana.»
   - Desplegable «Por qué» abierto: título semibold «El deseo se esconde detrás del cansancio»;
     tesis «Quien dice estar cansada muchas veces protege su deseo.»; «Evidencia: Débil»
     (Alta / Media / Débil); rótulo semibold «Solo para ti, no se publica»; lista «Autora: cita»
     («Siembra Autora Uno: El cansancio es una forma de decir que no.»).
   - Entra con subida de 8 px y fundido al cambiar de idea.
4. Error (si hubo): caja de error («Esa idea ya no está disponible.»)
5. Dos botones lado a lado: línea «Después» (la manda al final) · principal «Usar esta»
6. Botón callado «Descartar» → se abre en la página (no diálogo) un grupo con borde:
   - Leyenda «¿Por qué la descartas?»
   - Cuatro botones línea chicos en 2×2: «No me representa», «Repetida», «Débil», «Otro»
   - Botón callado chico «Cancelar»
7. Botón callado «+ Escribir una idea mía» (ícono más)

Toasts: «La sumé a las ideas de la semana.» + «Deshacer» · «Descarté la idea.» (la siguiente idea
toma su lugar y recibe el foco) · «Guardé tu idea y la sumé a las ideas de la semana.»

### 4.3 Estados vacíos del mazo
- **Banco vacío (nada libre en el servidor):** semibold «El motor propone ideas cada domingo a las
  20:00. Mientras, sube material en Conidolly Ingesta.» + botón línea chico «Abrir Conidolly
  Ingesta» (enlace a otra app) + «+ Escribir una idea mía».
- **Las usó todas en esta visita:** semibold «Usaste todas las ideas del banco. Escribe una idea
  nueva.» + «+ Escribir una idea mía».

### 4.4 Vista buscar
1. Campo con etiqueta «Buscar por palabra o tema», placeholder «culpa, celos, deseo», alto 52 px
2. Fila de chips de pilar (toggle, uno activo): «Todos», «Pareja», «Deseo», «Autoestima»,
   «Límites», «Bienestar»
3. Fila de chips de filtro (toggles independientes): «Fuerza alta», «Sin alertas», «Sin usar»
   (este último activo por defecto)
4. Conteo apagado: «3 resultados» / «1 resultado»
5. Lista de resultados (filas de 64 px con separador): gancho semibold; debajo en línea: píldora del
   pilar, badge éxito «Usada» o «En la semana» si aplica, «Fuerza alta», chips de alerta. Las ideas
   libres son tocables y abren esa idea en el mazo; las usadas no.
6. **Sin resultados:** «No encontré ideas con esa palabra.» + botón línea «Escribir una idea mía»
7. Más de 40: «Muestro 40 de 63. Escribe una palabra para acotar.»

### 4.5 Vista idea propia (dos pasos)
Encabezado: botón atrás «‹ Volver a las ideas» + título 24 px «Tu idea».

**Paso escribir**
1. Etiqueta «Tu idea» + área de texto (3 filas, máx. 220) + ayuda «La frase con que abrirías el
   reel, como la dirías tú.»
2. Etiqueta «De qué trata (si quieres)» + área de texto (3 filas, máx. 600)
3. Error (si hubo)
4. Botón principal «Proponer pilar y alertas» (deshabilitado sin texto; Claude propone)
5. Si hubo error: botón callado «Elegir yo el pilar»
6. Sin texto: ayuda centrada «Escribe tu idea primero.»
Errores: «Para proponerte el pilar necesito tu llave de Anthropic. Agrégala en Ajustes o elige el
pilar tú.» · «No pude proponerte el pilar ahora. Elígelo tú y confirma las alertas.» · «Llegaste al
tope de este mes. Súbelo en Ajustes para seguir.»

**Paso confirmar**
1. Cita del gancho en caja hundida: «Tu pareja te revisa el celular y lo llama amor.»
2. Apagado: «Esto propongo. Corrígelo si no calza.»
3. Grupo «Pilar»: 5 filas radio con borde (48 px): «Pareja y conversación», «Deseo y sexualidad»,
   «Autoestima», «Género y límites», «Bienestar emocional». La marcada: borde acento + tinte del
   pilar.
4. Selector «Formato»: «Mito o realidad», «Tres señales», «Ejercicio de la semana», «Pregunta de la
   audiencia», «Idea de sus libros» (más el que propuso Claude si es otro)
5. Grupo «Alertas para el guion»: 4 casillas con título y descripción:
   - «Verificar dato» · «Hay una cifra o un estudio que confirmar»
   - «Líneas de ayuda» · «Toca violencia, abuso o salud mental»
   - «No es terapia» · «Roza el diagnóstico o un caso particular»
   - «Nota» · «Una indicación para quien escribe el guion»
   (marcada, la descripción se reemplaza por el texto de Claude o por el texto por defecto, p. ej.
   «El tema toca violencia, abuso o salud mental: la publicación lleva las líneas de ayuda de Chile.»)
6. Error (si hubo)
7. Botón principal «Guardar idea» (deshabilitado sin pilar) + ayuda «Elige el pilar para guardarla.»

Guardar vuelve al mazo con el toast «Guardé tu idea y la sumé a las ideas de la semana.»

---

## 5. Guion/[id] (`/guion/:id`)

**Propósito:** puerta 1. Leer y editar el guion y el texto de la publicación, elegir avatar,
confirmar la revisión automática y deslizar. Después, en la misma pantalla, grabar voz y video.
Sin navegación inferior. Si la pieza está en un estado de video, redirige a `/video/:id`.

### 5.1 Estado "Guion por aprobar" (`guion_por_aprobar`)

1. **Encabezado a sangre** (fondo = tinte del pilar, llega a los bordes y arriba):
   - «‹ Inicio»
   - Título display: «El deseo no se apaga, se esconde»
   - Chips: píldora «Deseo y sexualidad» + chip superficie «Mito o realidad · 52 s»
   - Línea destacada (caja superficie, texto acento semibold): «Si lo apruebas hoy, sale el jueves 8
     de octubre · 19:00» (calcula el horario libre después de lo que ya está en cola)
2. **Explicación** (si viene de un rechazo; caja de advertencia, `role=alert`): «HeyGen no aceptó
   una frase del guion. Revísalo y vuelve a aprobarlo.»
3. **Sección «El guion»** (editor):
   - Etiqueta «Guion» + área de texto grande (12 filas, máx. 2.000), hoy en serif 20 px (la voz de
     Coni). El guion puede traer marcas de tono entre corchetes: `[warm]`, `[pause]`...
   - Contador: «123 palabras · ≈ 52 s» + estado semibold «Bien» («Un poco corto» bajo 75 palabras,
     «Un poco largo» sobre 150)
   - Ayuda de marcas (dos líneas apagadas): «Lo que va entre corchetes marca el tono de la voz. No
     se lee ni sale en los subtítulos.» / «Marcas que conozco: [warm] [softly] [gentle] [reassuring]
     [encouraging] [thoughtful] [empathetic] [calm] [confident] [clear] [casual] [matter-of-fact]
     [pause] [sighs]»
   - Etiqueta «Texto de la publicación» + área de texto (8 filas, máx. 2.200). Ej.: «El deseo no
     se apaga: se esconde detrás del cansancio y la rutina.\n\nVideo hecho con mi avatar digital.»
   - Error al guardar (caja de error)
   - Hallazgos bloqueantes al guardar (marcas de revisión rojas, ver 5.3)
   - Confirmación al guardar: «Guardado» (acento semibold) + «· Claude lo revisó: 2 observaciones
     para confirmar abajo, en Revisión.»
   - Botón principal «Guardar cambios» (deshabilitado sin cambios; «Guardando…» al guardar)
   - Botón callado «Volver a la versión de Claude» (solo si existe) → caja acento suave:
     «¿Volver al guion que escribió Claude? Se guarda como una versión nueva.» + principal «Sí,
     volver» + callado «Cancelar»
4. **Sección «Avatar»**:
   - «Elige con qué avatar se graba»
   - Grilla de 2 columnas de tarjetas radio: foto 3:4 + nombre semibold. Ej.: «Estudio»,
     «Terraza». Nada viene marcado. Marcada: borde 2 px acento + fondo acento suave.
   - **Sin avatares:** caja de advertencia «Todavía no hay avatares para elegir: avísale a Federico.»
5. **Sección «Revisión»**:
   - Apagado: «Claude revisó el guion. Tú decides.» (sin hallazgos: «Claude revisó el guion y no
     encontró observaciones. Tú decides.»)
   - Lista de marcas de revisión (5.3). Ej. advertencia: «Para confirmar: El tema es sexualidad.
     HeyGen revisa estos guiones con más cuidado; confirma que el lenguaje es educativo.» + casilla
     «Lo revisé y está bien».
6. **Barra fija inferior** (superficie, borde superior, sombra flotante, safe-area):
   - Error de aprobación (caja de error)
   - **Deslizar:** «Desliza para aprobar el guion» (pista píldora 60 px, fondo acento suave, pulgar
     acento 52 px; deshabilitado: pista hundida y pulgar apagado)
   - Motivo bajo el deslizador cuando está deshabilitado (uno a la vez, en este orden):
     «Guarda tus cambios antes de aprobar» · «Hay algo que corregir antes de aprobar.» · «Todavía no
     hay avatares para elegir.» · «Falta elegir el avatar y confirmar la revisión.» / «Falta elegir
     el avatar.» / «Falta confirmar la revisión.»
   - Ayuda centrada: «Aprobar no gasta nada. Después grabas la voz y el video.»
   - Botón callado «Pedir cambios» → reemplaza la barra por caja acento suave: «Se escribe un guion
     nuevo y este se descarta. ¿Seguro?» + principal «Sí, pedir cambios» + callado «Volver»
   - Errores de aprobación posibles: «Elige con qué avatar se graba antes de aprobar.» · «Ese avatar
     ya no está disponible. Elige otro.» · «Esto cambió mientras lo revisabas y no quedó aprobado.
     Vuelve a revisarlo.» · «Esta pieza cambió mientras la mirabas. Vuelve a abrirla.» · «Todavía no
     puedes aprobar: la revisión tiene algo que corregir.»
   - Toast de advertencia posible: «Pedí los cambios, pero el nuevo guion tarda en partir. Si no
     avanza, vuelve a intentarlo.»

**Acción principal:** deslizar para aprobar. **Secundarias:** guardar cambios, volver a la versión
de Claude, pedir cambios, elegir avatar, confirmar hallazgos.

Sub-estados para mockups: limpio sin cambios · con cambios sin guardar · guardado con
observaciones · bloqueado por hallazgo · sin avatares · listo para deslizar · pidiendo cambios
(confirmación abierta) · volviendo a versión de Claude (confirmación abierta) · con explicación de
rechazo.

### 5.2 Estado "Guion aprobado" (`guion_aprobado`, `grabando_voz`): solo lectura + barra de grabación

1. Encabezado igual que 5.1 pero **sin** la línea «Si lo apruebas hoy...»
2. Explicación si falló la voz (caja de advertencia): «La voz no terminó de grabarse. Vuelve a
   intentarlo.» · «El guion cambió después de aprobarlo. Vuelve a aprobarlo antes de grabar la voz.»
   · tope de gasto.
3. Sección «El guion» en lectura: guion (17 px, preserva saltos), ayuda de marcas si tiene marcas,
   texto de la publicación en apagado, nota «Estoy grabando tu voz» / «Tarda unos segundos.»
   (fondo hundido) mientras graba, y la línea «Para cambiar el guion o el texto, vuelve a revisar
   el guion.»
4. Sección «Avatar»: solo el nombre, «Estudio» (o «El avatar que elegiste»).
5. Sin sección Revisión.
6. **Barra de grabación** (en el flujo, no fija; separada por borde superior):
   - Error (caja de error): «No pude empezar a grabar la voz. Inténtalo de nuevo en unos minutos.»
   - **Bloque voz:**
     - Reproductor de voz si ya existe (13.9)
     - Botón: «Grabar voz» (principal, sin voz) / «Volver a grabar voz» (línea, con voz) /
       «Grabando la voz…» (deshabilitado)
     - Línea de costo: «Grabar voz: ~682 caracteres (US$ 0,20)» / «Volver a grabar voz: ~682
       caracteres (US$ 0,20)»
     - Línea de saldo: «ElevenLabs: te quedan 99.000 de 100.000 caracteres. Se renuevan el 12 de
       octubre.» (o el bloqueo, ver abajo)
   - **Bloque video:**
     - Botón principal «Grabar video» → caja acento suave: «¿Grabar el video? Cuesta unos US$ 1,36.»
       + principal «Sí, grabar» + callado «Volver»
     - Línea de costo: «Grabar video: ~52 s (US$ 1,36) · incluye la voz» (sin voz grabada) /
       «Grabar video: ~52 s (US$ 1,16)» (con voz)
     - Línea de saldo: «Saldo de API de HeyGen: US$ 50,00. Es aparte de tu plan de HeyGen.»
   - Botón callado «Volver a revisar el guion» (quita la aprobación y vuelve a 5.1; deshabilitado
     mientras graba la voz)
   - Bloqueos que reemplazan la línea de saldo y deshabilitan el botón:
     - Tope: «Llegaste al tope de gasto de este mes. Súbelo en Ajustes o espera al próximo mes.»
     - ElevenLabs: «No te alcanzan los caracteres de ElevenLabs (te quedan 300 y esta voz usa 682).
       Recarga o mejora tu plan en elevenlabs.io, en Suscripción.»
     - HeyGen: «Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,50 y este video cuesta unos
       US$ 1,16). Recárgalo en app.heygen.com, en la sección API. Los créditos de tu plan de HeyGen
       no sirven para grabar desde Conidolly.»
   - Saldo desconocido (no bloquea): «No pude ver tu saldo de ElevenLabs.» · «No pude ver tu saldo de
     API de HeyGen.» · «HeyGen no informa un saldo de API para tu llave.»
   - Sin configuración legible: los botones funcionan pero sin líneas de costo ni saldo.
   - Toast de advertencia posible: «Quedó aprobado, pero la grabación tarda en partir. Si no avanza,
     te aviso.»

Sub-estados para mockups: sin voz · con voz (sin escuchar / ya escuchada) · grabando voz ·
confirmando video · bloqueado por saldo o tope · falla de voz con explicación.

### 5.3 Marca de revisión (hallazgo)
- **Advertencia** (fondo advertencia, radio 14, padding 14): «**Para confirmar:** {mensaje}» +
  opcional «Frase marcada: «{frase}»» (la frase hoy en serif) + casilla «Lo revisé y está bien».
- **Bloqueante** (fondo error): «**Hay que corregirlo:** {mensaje}» + frase + «Sin esto no puedes
  aprobar.»
- Mensajes reales de las reglas automáticas:
  - «El guion tiene que terminar con «Soy Coni del Rosario.»»
  - «Sin emojis, hashtags ni símbolos en el guion: van solo en la publicación.»
  - «El texto de la publicación tiene que avisar que es un avatar digital: «Video hecho con mi
    avatar digital.»»
  - «Este tema pide las líneas de ayuda de Chile en el texto de la publicación: 1455 y *4141.»
  - «El guion tiene 160 palabras. Lo ideal es entre 75 y 150.»
  - «Escribe los números con palabras (tres señales, no 3 señales).»
  - «Esta marca de tono no la conozco: [happy]. Usa una de la lista o bórrala.»
  - «El guion tiene 8 marcas de tono. Con 3 a 6 la voz suena natural; con más suena actuada.»
  - «Las marcas de tono van solo en el guion. Bórrala del texto de la publicación.»
  - «Esta frase repite palabra por palabra una de las fuentes. Dila con tus palabras.»
  - «Aquí aparece el nombre de una fuente. En el reel no se nombran autores: dilo sin nombrarla.»
  - Claude (solo advierte): diagnóstico, caso particular, lenguaje explícito, cifra sin verificar,
    tema de riesgo. Ej.: «El tema es sexualidad. HeyGen revisa estos guiones con más cuidado;
    confirma que el lenguaje es educativo.»

### 5.4 Estados sencillos (misma ruta, sin editor)
Plantilla: título display de la pieza → nota → acciones → botón línea grande «Volver a Inicio».
| Estado | Nota | Acciones |
|---|---|---|
| Escribiendo guion | Hundida: «Estoy escribiendo el guion» / «Tarda unos minutos; te aviso cuando esté para que lo leas.» + barra esqueleto | Solo «Volver a Inicio» |
| No pudo escribir | Error: «No pude escribir el guion» / «No pude empezar a escribir el guion. Inténtalo de nuevo.» | Principal «Reintentar», callado «Descartar esta pieza» |
| Grabando video (`en_render`, `subtitulando`) | Hundida: «Aprobado. Estoy grabando el video.» / «Tarda unos 5 minutos; te aviso cuando esté para que lo veas.» + barra esqueleto | Solo «Volver a Inicio» |
| Video detenido (tope) | Error: «El video está detenido» / «Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir.» | Solo «Volver a Inicio» |
| Error de producción | Error: «No se pudo terminar el video» / «HeyGen no pudo terminar el video» (o «El video tardó demasiado en estar listo. Puedes volver a intentarlo.») + opcional «Mientras tanto, puedes escuchar la voz.» con reproductor + meta «Saldo de API de HeyGen: US$ 50,00. Es aparte de tu plan de HeyGen.» | Principal «Reintentar», callado «Descartar esta pieza» |
| Ya no en curso (descartada) | Apagado: «Esta pieza ya no está en curso.» | Solo «Volver a Inicio» |

---

## 6. Video/[id] (`/video/:id`)

**Propósito:** puerta 2. Ver el video tal como sale, revisarlo, ver el texto, elegir fecha y
deslizar. Luego, los estados de programado, subida a mano y publicado. Sin navegación inferior.
Estados de guion redirigen a `/guion/:id`.

### 6.1 Estado "Video por aprobar" (`video_por_aprobar`)

1. **Encabezado:** «‹ Inicio» · meta apagada «Video por aprobar» · título 24 px «Ser tu propia
   diosa» · chips: píldora «Autoestima» + chip hundido «48 s»
2. **Primera vez** (solo el primer video que abre en su vida; nota de éxito): «Así se ve tu avatar.
   Si algo no te calza, regrábalo.»
3. **Explicación** (caja de advertencia, si la hay): «La hora aprobada pasó sin publicarse. Elige
   una nueva fecha.» · «La hora aprobada ya pasó. Elige una nueva fecha.»
4. **Reproductor 9:16 a sangre** (ancho completo, fondo tinta, alto máximo 88 % de la pantalla):
   - Etiqueta fija arriba a la izquierda: «Avatar IA» (píldora tinta translúcida)
   - Controles abajo sobre degradado oscuro: botón circular 48 px play/pausa (claro), barra de
     progreso, «0:00 / 0:48»
   - Falla: «No pude cargar el video. Recarga la pantalla.» al centro
   - Capa de zonas (toggle): franja inferior 22 % con borde punteado «Aquí Instagram pone el texto y
     los botones» y columna derecha punteada (botones de Instagram)
5. **Fila bajo el video:** a la izquierda «Míralo completo para aprobar» → «**Lo viste completo**»
   (se recuerda por video); a la derecha botón texto acento «Ver zonas de Instagram» / «Ocultar
   zonas de Instagram»
6. **Antes de verlo completo:** apagado 17 px «Cuando termine el video aparece lo que falta para
   aprobarlo.»
7. **Después de verlo completo:** aparece un panel elevado (superficie, esquinas superiores 24,
   sombra flotante, a sangre) con:
   - Sección «Antes de aprobar»: casilla «Revisé labios, nombre, subtítulos y cortes»
   - Sección «Así sale en Instagram»: el texto tal cual en caja con borde + botón texto «Editar el
     texto» → formulario: etiqueta «Texto de la publicación», área de 9 filas, contador «98 de
     2.200» (rojo sobre 2.200), principal «Guardar el texto», callado «Cancelar».
     Errores: «El texto no puede quedar vacío.» · «Instagram acepta hasta 2.200 caracteres en el
     texto.»
   - Sección «Revisión» (solo si hay hallazgos; ver 5.3)
   - Sección «Fecha de publicación»: «jueves 8 de octubre · 19:00» (semibold) + botón texto
     «Cambiar» / «Listo»; debajo «Hora de Chile · próximo horario libre»; al cambiar, lista de 4
     radios con borde: «jueves 8 de octubre · 19:00», «sábado 10 de octubre · 19:00», «martes 13 de
     octubre · 19:00», «jueves 15 de octubre · 19:00». Sin horarios: «No hay un horario libre en
     los próximos días.»
8. **Barra fija inferior:**
   - Error (caja de error): «Ese horario ya lo tiene otro reel. Elige otro.» · «La fecha de
     publicación ya pasó. Elige una hora futura.» · cambios concurrentes.
   - **Deslizar:** «Desliza para aprobar video y fecha»
   - Motivo (uno a la vez): «Se activa al terminar de verlo.» · «Hay algo que corregir antes de
     aprobar.» · «Marca lo que revisaste.» · «Confirma la revisión.» · «No hay un horario libre.
     Avísale a Federico.»
   - Botón callado «Regrabar» → caja acento suave: «Se vuelve a grabar con tu avatar y este video se
     descarta. Regrabar cuesta unos US$ 1,16. ¿Seguro?» + principal «Sí, regrabar» + callado
     «Volver». Tras regrabar la pantalla pasa a «Aprobado. Estoy grabando el video.» (5.4).

Sub-estados para mockups: sin ver (reproduciendo o en pausa) · visto con panel · zonas visibles ·
cambiando fecha · editando texto · con hallazgos · primera vez · regrabar (confirmación) · error
de carga.

### 6.2 Estados posteriores (plantilla sencilla: título display, nota, acciones, «Volver a Inicio»)
| Estado | Nota | Contenido / acciones |
|---|---|---|
| Programado, Instagram conectado | Éxito: «Programado para el jueves 8 de octubre · 19:00» / «Sale con la etiqueta de IA. Puedes cambiar la fecha mientras no se publique.» | Principal «Cambiar la fecha» (vuelve a 6.1), callado «Descartar esta pieza» |
| Programado, sin Instagram | Éxito: mismo título / «Instagram todavía no está conectado, así que este reel no sale solo. A esa hora te aviso y lo subes tú.» | Pasos de subida a mano (6.3) + «Cambiar la fecha» + «Descartar esta pieza» |
| Para subir a mano | Advertencia: «Listo para que lo subas a Instagram» / «Instagram todavía no está conectado, así que este reel no sale solo. Súbelo tú con estos pasos.» | Pasos 6.3 + **principal** «Descartar esta pieza» (única acción, por eso queda como principal) |
| Subido a mano | Éxito: «Subido a mano» / «Lo subiste tú a Instagram, con la etiqueta de IA.» + callado chico «Ver en Instagram ↗» | Solo «Volver a Inicio» |
| Publicado | Éxito: «Ya se publicó» / «La etiqueta de IA quedó puesta en Instagram.» + «Ver en Instagram ↗» | Solo «Volver a Inicio» |
| Error de publicación | Error: «No se pudo publicar» / «Instagram no aceptó la publicación. WAV ya está revisando.» (u otra) + opcional «Es posible que el reel ya esté en Instagram. Reintentar solo vuelve a comprobarlo.» | Principal «Reintentar», callado «Descartar esta pieza» |
| Ya no en curso | «Esta pieza ya no está en curso.» | Solo «Volver a Inicio» |

### 6.3 Pasos de subida a mano (`subir-a-mano.tsx`)
Cuatro secciones numeradas:
1. «1. Descarga el video»: principal «Descargar video». Error: «No pude preparar el video para
   descargarlo. Inténtalo de nuevo en unos minutos.»
2. «2. Copia el texto»: el texto aprobado en caja con borde + callado «Copiar texto» + estado
   «Texto copiado» o «No pude copiarlo. Mantén apretado el texto de arriba para copiarlo.»
3. «3. Súbelo en Instagram»: viñetas «Súbelo como Reel y pega el texto.» y «Antes de publicar,
   activa la etiqueta «Información de IA». Es tu avatar y tiene que decirlo.» + casilla «Activé la
   etiqueta «Información de IA»»
4. «4. Avísame cuando esté arriba»: campo opcional «Enlace del reel (opcional)», placeholder
   `https://www.instagram.com/reel/...`; principal «Ya lo subí» (deshabilitado hasta marcar la
   etiqueta) + ayuda «Se activa cuando confirmas la etiqueta de IA.» Error: «Este reel ya no está
   esperando que lo subas.»

---

## 7. Calendario (`/calendario?vista=mes|agenda|ritmo`)

**Propósito:** ver cuándo sale cada reel, qué espacios quedan libres y el ritmo de publicación.
Vista por defecto: **Mes**. Con navegación inferior (sin pestaña activa).

Encabezado: «‹ Inicio» + título display con el mes en mayúscula inicial «Octubre».
Control segmentado (tres enlaces, cada vista tiene dirección propia): «Mes» · «Agenda» · «Ritmo».
Activa: superficie con sombra mínima; inactivas: apagado sobre hundido.

### 7.1 Mes
1. Iniciales de la semana: «L M M J V S D»
2. Grilla de 7 columnas (celdas cuadradas, mínimo 44 px): número del día + un punto de 7 px por
   publicación, del color del pilar (apagado si no tiene). Hoy: fondo acento suave, número acento
   negrita. Octubre 2026 empieza en jueves (3 celdas vacías). El lector oye «jueves 8: Pareja y
   conversación» y «, para subir» / «, subido a mano» cuando aplica.
3. **Vacío del mes:** «Nada programado este mes.» + botón línea chico «Elegir ideas» → `/ideas`
4. Sección «Para subir» (si hay): filas «Para subir · martes 6 · 19:00 · Autoestima» → `/video/id`
5. Sección «Próximos» (hasta 3, no tocables): «Si van a discutir, siéntense del mismo lado» ·
   «jueves 8 · 19:00 · Pareja y conversación»

### 7.2 Agenda (4 semanas desde la actual)
- Por semana: rótulo semibold «Semana del 5 al 11 de octubre» y filas de horario:
  - Columna izquierda (72 px): «Jueves 8» / «19:00» (apagado)
  - Ocupado: bloque con tinte del pilar, título semibold, nombre del pilar en tinta del pilar,
    chip de estado:
    - éxito: «Programado», «Subido a mano»
    - advertencia: «Para subir», «Falta tu firma: video y fecha», «Falta tu firma: guion»,
      «Guion aprobado · falta grabar»
    - error: «Algo falló al grabar»
    - neutro (texto sin chip): «Grabando la voz», «Grabando», «Guion en preparación»; si la pieza
      aún no tiene fecha aprobada se agrega «· lugar propuesto»
    - Tocable cuando hay algo que hacer (video o guion); lo que trabaja no.
  - Libre: caja con borde punteado «Libre · elige una idea» → `/ideas`
  - Semana sin horarios: «Sin espacios de publicación en lo que queda de esta semana.»

### 7.3 Ritmo (4 semanas hasta la actual)
- Resumen 18 px: «Tu horario tiene 3 espacios por semana. En estas 4 semanas van 5 de 7.»
- Tabla: encabezados de columna «Mar · Jue · Sáb»; filas con etiqueta «14 sep», «21 sep»,
  «28 sep», «5 oct»; celdas llenas con la primera palabra del pilar sobre tinte fuerte («Pareja»,
  «Deseo», «Autoestima», «Género», «Bienestar»; «Reel» sin pilar) o libres con borde punteado
  «libre».
- Sugerencia (nota de advertencia, solo con más de 3 semanas de historia): «Los sábados casi siempre
  quedan libres. ¿Cambiamos el horario o publicamos menos días a la semana?»
- **Vacío:** «Cuando haya reels publicados o programados, aquí verás cómo se reparten por semana.»

---

## 8. Métricas (`/metricas`)

**Propósito:** qué le sirvió a la gente, con honestidad sobre el tamaño de la muestra. Pestaña
activa: Métricas.

1. **Encabezado:** título display «Octubre» + resumen apagado «3 reels publicados · 1 consulta ·
   8 toques en tu link»
2. **Nota de advertencia** (si aplica): «No pude traer las métricas de hoy; muestro las del lunes 5
   de octubre.» o «Todavía no tengo números de tus reels. Si mañana sigue igual, avísale a Federico.»
3. **Sección «Lo que sirvió»:**
   - Ayuda: «Guardados cada 1.000 personas que lo vieron.»
   - Lista ordenada por guardados cada 1.000 (últimas 12 semanas). Cada fila:
     - Título semibold: «Si van a discutir, siéntense del mismo lado»
     - Barra 10 px (pista hundida, relleno del color del pilar, escalada al mejor visible)
     - «50,4 cada 1.000 · 121 guardados de 2.400 personas»
     - Apagado: «Pareja y conversación · 1 reel de este tema»
     - Otras filas de ejemplo: «El deseo no se apaga, se esconde» · «12 cada 1.000 · 12 guardados
       de 1.000 personas» (barra 24 %) · «Ser tu propia diosa» · «5 cada 1.000 · 10 guardados de
       2.000 personas» (barra 10 %)
     - Sin números: sin barra y «Todavía sin números: llegan cada mañana a las 7:00.»
   - **Vacío:** «Todavía no hay reels publicados.» (semibold) + «Cuando salga el primero, aquí vas a
     ver qué le sirvió a la gente.»
4. **Panel de comparación** (justo debajo; caja hundida radio 20; no aparece sin reels):
   - **Temprano:** título «Todavía es temprano para concluir»; texto «Comparo temas cuando haya 8
     reels de cada uno. El tema con más reels lleva 1 de 8. Cuento los reels desde que cumplen una
     semana.»; barra de 8 segmentos con 1 lleno (acento); lista en línea «Autoestima · 1 ·
     Pareja y conversación · 1 · Deseo y sexualidad · 1». Variante: «Autoestima ya tiene 8 reels.
     Comparo cuando otro tema también llegue a 8; el siguiente lleva 5 de 8. Cuento los reels desde
     que cumplen una semana.»
   - **Sin números:** «Todavía no hay con qué comparar» + «Cuando lleguen los números de tus reels,
     aquí verás cuántos hay de cada tema. Comparo temas cuando haya 8 reels de cada uno.»
   - **Comparable:** «Comparación de temas»; una línea por tema «Autoestima · 8 reels · promedio 42
     cada 1.000 (entre 35 y 49)»; frase «Autoestima va por delante de Pareja y conversación por 12
     cada 1.000 (entre 4 y 20). La diferencia es mayor que lo que varían tus reels entre sí.» (o
     «Todavía no es mayor que lo que varían tus reels entre sí.»); cautela apagada «Es una
     comparación de lo ya publicado: entre un tema y otro cambian también el gancho y el día. No
     entran los reels de los últimos 7 días, que aún están sumando guardados.»; «Todavía sin
     comparar:» + lista de temas.
5. **Sección «Semana a semana»:**
   - Ayuda: «Los toques en tu link cuentan una vez por persona, por link y por día.»
   - Por semana: rótulo «Semana del 5 al 11 de octubre», filas de pieza no tocables con meta «121
     guardados · 2.400 de alcance · en promedio se vio 24 s» (o «Todavía sin números»), y resumen
     apagado «1 consulta · 8 toques en tu link».
   - **Vacío:** «Cuando haya reels, consultas o clics, los verás aquí por semana.»

---

## 9. Ajustes (`/ajustes`)

**Propósito:** estado de la configuración, avisos del celular, preferencias de publicación y gasto,
cuentas y saldos. Todo cambio se guarda solo y se puede deshacer. Pestaña activa: Ajustes.

### 9.1 Elementos en orden
1. Título display «Ajustes»
2. **Nota de vuelta de Instagram** (solo tras conectar; según `?instagram=`):
   - éxito «Instagram quedó conectado.»
   - advertencia «Cancelaste la conexión con Instagram.» / «Cuando quieras, vuelve a intentarlo
     desde Cuentas conectadas.»
   - error «Instagram no aceptó la conexión.» / «Vuelve a conectarla desde Cuentas conectadas.»
   - error «La conexión con Instagram venció antes de terminar.» / «Empieza de nuevo desde Cuentas
     conectadas.»
   - error «Todavía no está lista la conexión con Instagram.» / «Falta configurar la app de Meta:
     avísale a Federico.»
   - error «No pude terminar la conexión con Instagram.» / «Inténtalo de nuevo en unos minutos. Si
     sigue igual, avísale a Federico.»
3. **Bloque de estado** (radio 20, padding 18; ver 9.2)
4. **Sección «Avisos en tu celular»** (ver 9.3)
5. **Editor de ajustes** (ver 9.4)
6. **Sección «Cuentas conectadas»** (ver 9.5)
7. **Sección «Saldos»:** «ElevenLabs: te quedan 23.400 de 100.000 caracteres. Se renuevan el 12 de
   octubre.» / «Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen.» + apagado «El
   saldo de API de HeyGen es distinto de los créditos de tu plan: Conidolly graba con el saldo de
   API.» (sin respuesta: «No pude ver tu saldo de ElevenLabs.»)
8. Botón callado «Cerrar sesión» (cierra solo en este aparato y lleva a Ingreso)

Bloque de estado, cuentas y saldos cargan con esqueletos propios mientras revisan los servicios.

### 9.2 Bloque de estado (4 variantes)
- **Configurando** (superficie con borde): título 20 px «Configuración: 3 de 5 listos»; texto
  «Instagram no está conectado. Mientras tanto, cada reel espera a que lo subas tú a mano.» (+
  « También falta lo que sigue.») o «Falta lo que sigue; el resto ya está.»; lista de 5 pasos
  (filas 48 px con separador) con chip a la derecha «Listo» con ícono check (éxito) o «Falta» (advertencia):
  «Instagram conectado», «HeyGen con tu avatar», «ElevenLabs con tu voz», «Claude (Anthropic)»,
  «Avisos en tu celular»; botón principal ancho «Conectar Instagram» (o «Agregar la llave de HeyGen»
  que salta a su fila).
- **Todo bien** (fondo éxito): «Todo conectado» + «Instagram, HeyGen, ElevenLabs y Claude
  respondieron hoy a las 10:30.»
- **Atención** (fondo advertencia), una sola acción principal:
  - «Instagram vence en 6 días» (o «vence mañana») / «Renueva la conexión para que los reels sigan
    saliendo.» / «Renovar Instagram»
  - «Instagram dejó de estar conectado» / «Conéctalo de nuevo para que los reels sigan saliendo.» /
    «Renovar Instagram»
  - «HeyGen no aceptó la llave» / «Pega una llave nueva para que sigan los guiones y los videos.» /
    «Cambiar la llave de HeyGen»
- **Sin revisión** (fondo hundido): «No pude revisar las cuentas ahora» / «Lo intento de nuevo
  cuando abras Ajustes.»

### 9.3 Avisos en tu celular (5 estados + cargando)
- **Instalar** (iPhone en Safari): hoja con borde, título 20 px «Agrégala a tu pantalla de inicio»;
  «Para recibir avisos en el iPhone, primero instala la app. Toma un minuto y necesitas iOS 16.4 o
  más nuevo.»; tres pasos con ícono acento: (Compartir) «Toca **Compartir**, el cuadrado con la
  flecha hacia arriba, abajo en Safari.» · (Más) «Elige **Agregar a inicio** y toca Agregar.» ·
  (cuadro "C") «Abre Conidolly desde tu pantalla de inicio y vuelve a Ajustes para activar los
  avisos.»
- **Listo para activar:** «Te aviso aquí cuando tengas un guion o un video para revisar. El aviso
  solo te lleva a la pantalla: aprobar lo haces tú, mirándolo.» + principal «Activar avisos»
- **Activo:** nota éxito «Avisos activados en este celular» + línea «Enviar uno de prueba» + callado
  chico «Desactivar avisos»; tras probar, nota éxito «Listo, te lo mandé. Debería llegarte en unos
  segundos.»
- **Bloqueado:** nota advertencia «Los avisos están bloqueados» / «Para volver a activarlos, abre
  Ajustes del iPhone, entra a Notificaciones, busca Conidolly y activa Permitir notificaciones.
  Después vuelve aquí.»
- **No disponible:** nota hundida «Este celular no puede recibir avisos» / «En iPhone hace falta iOS
  16.4 o más nuevo. Mientras tanto te los mando por correo, y también cuando algo falla.»
- Errores (nota error): «No pude activar los avisos en este celular. Inténtalo de nuevo.» · «No pude
  desactivar los avisos. Inténtalo de nuevo.» · «Primero activa los avisos en este celular.» ·
  «Este celular ya no recibe avisos. Actívalos de nuevo.» · «No pude mandarlo ahora. Inténtalo en
  unos minutos.»

### 9.4 Editor de ajustes (se guarda solo)
- «Meta de este mes»: control segmentado «Consultas» · «Talleres» · «Marca»
- «Días de publicación»: chips toggle «Lun» «Mar» «Mié» «Jue» «Vie» «Sáb» «Dom» (por defecto Mar,
  Jue, Sáb presionados = acento); debajo «A las [19:00] hora de Chile» con campo de hora.
  Error: «Deja al menos un día de publicación.»
- «Tope de gasto al mes»: stepper (botón línea 44 px «−» · valor 20 px semibold «US$ 40» · «+»),
  pasos de 5 entre 0 y 500; debajo «Llevas US$ 22,00 este mes»
- «Avisos»: dos filas con casilla a la derecha: «Resumen diario a las 08:30» y «Avisarme apenas
  falle algo»
- Error (caja de error)
- Apagado: «Los cambios se guardan solos. Lo que ya aprobaste mantiene su fecha.»
- Toast tras cada cambio: «Guardado» + «Deshacer». Tope bajo lo gastado: «Ya gastaste US$ 22,00;
  con este tope no grabo más hasta el próximo mes.» + «Deshacer»

### 9.5 Cuentas conectadas
Filas con separador: nombre semibold a la izquierda, chip de estado a la derecha, botón debajo.
- Nombres: «Instagram», «HeyGen», «ElevenLabs», «Claude (Anthropic)»
- Chips: «Conectada» (éxito) · «Falta» (advertencia) · «Vence mañana» / «Vence en 6 días»
  (advertencia) · «Desconectada» (error) · «No aceptó la llave» (error) · «Sin revisar» (neutro)
- Instagram: botón línea chico «Conectar Instagram» (si falta) / «Renovar Instagram» (va a Meta)
- Las demás: botón línea chico «Agregar la llave de HeyGen» / «Cambiar la llave de HeyGen» →
  formulario en línea: etiqueta «Llave de HeyGen», campo de contraseña, ayuda «Pégala completa. La
  reviso con HeyGen y queda guardada cifrada.», error, dos botones «Cancelar» (línea) y «Guardar y
  comprobar» (principal).
- Toasts: «Guardada y comprobada.» · «Guardada. No pude comprobarla ahora, la reviso más tarde.» ·
  «Guardada. Falta tu voz de ElevenLabs: avísale a Federico.» Error: «Pega la llave completa, sin
  espacios.»

---

## 10. Anexo

### 10.1 Página pública `/l` (link de la bio)
Fuera del alcance de la app privada, pero comparte tokens. Registro de marca: frambuesa a sangre
(incluido el overscroll), texto en `sobre-acento` sin transparencias.
- Título 44 px serif «Coni del Rosario» + «Psicóloga clínica y sexóloga»
- Lista de enlaces (configurables) con flecha a la derecha, título semibold y detalle opcional,
  separadores al 30 %
- Pie: «Contenido educativo. No reemplaza una consulta. Algunos videos usan mi avatar digital.»
- Decidir si el rediseño la toca: hoy es la única superficie donde el acento es fondo.

### 10.2 Avisos push (pantalla de bloqueo)
Título siempre «Conidolly». Cuerpos (nunca llevan el texto de la pieza):
«Tienes ideas nuevas para elegir» · «Tienes un guion listo para revisar» · «Tienes un video listo
para revisar» · «Algo no salió como esperábamos. Mira qué pasó» · «Tu reel ya está publicado» ·
«Llegaste al tope de gasto de este mes» · «Tu conexión con Instagram necesita atención» · «Tienes
algo esperando tu firma» · «Tu reel está listo para subir a Instagram». Ícono de app: hoy una «C»
blanca sobre frambuesa (placeholder hasta tener logo).

---

## 11. Mapa de navegación y ciclo de vida

### 11.1 Rutas
```
/ingreso ──código ok──▶ /
/  (Inicio)
├── fila "Necesita tu firma" ──▶ /guion/:id  o  /video/:id
├── fila "Para subir a Instagram" ──▶ /video/:id
├── fila "En camino: Guion aprobado · falta grabar" ──▶ /guion/:id
├── aviso sin leer ──▶ /guion/:id | /video/:id | /
├── nota de error "Revisar…" ──▶ /guion/:id | /video/:id
├── "Ver calendario" ──▶ /calendario?vista=mes
├── "Ver todas las ideas" / "Escribir una idea" ──▶ /ideas
└── "Elegir ideas ahora" ──▶ #ideas (misma página)
/ideas  (mazo ⇄ buscar ⇄ idea propia, en la misma ruta) ── "‹ Inicio" ──▶ /
/calendario?vista=mes|agenda|ritmo
├── "Elegir ideas" / "Libre · elige una idea" ──▶ /ideas
└── bloque ocupado tocable ──▶ /guion/:id | /video/:id
/guion/:id ⇄ /video/:id  (cada una redirige a la otra según el estado)
/metricas    /ajustes ──"Conectar/Renovar Instagram"──▶ Meta ──▶ /ajustes?instagram=…
Nav inferior: Inicio · Métricas · Ajustes (oculta en /guion y /video)
```

### 11.2 Estados de una pieza y la pantalla que los muestra
| Estado | Pantalla | En Inicio | En Agenda |
|---|---|---|---|
| `guion_en_proceso` | Guion 5.4 escribiendo / no pudo | En camino «Escribiendo el guion · te aviso» o nota de error | «Guion en preparación» |
| `guion_por_aprobar` | Guion 5.1 | Necesita tu firma «Guion · 52 s» | «Falta tu firma: guion» |
| `guion_aprobado` | Guion 5.2 | En camino «Guion aprobado · falta grabar» | igual |
| `grabando_voz` | Guion 5.2 grabando | En camino «Grabando la voz · unos segundos» | «Grabando la voz» |
| `en_render`, `subtitulando` | Guion 5.4 grabando video | En camino «Grabando · unos 5 min · te aviso» | «Grabando» |
| `error_produccion` | Guion 5.4 error | Nota de error «Revisar» | «Algo falló al grabar» |
| `video_por_aprobar` | Video 6.1 | Necesita tu firma «Video · 48 s» | «Falta tu firma: video y fecha» |
| `programado` | Video 6.2 | En camino «Programado · jueves 8 · 19:00» | «Programado» |
| `para_subir_a_mano` | Video 6.2 + 6.3 | Para subir a Instagram | «Para subir» |
| `publicado` | Video 6.2 | Nota de celebración (2 días) | (Mes: punto) |
| `publicado_a_mano` | Video 6.2 | Nota «subido a mano» (2 días) | «Subido a mano» |
| `error_publicacion` | Video 6.2 error | Nota de error «Revisar» | no aparece |
| `descartado` | «Esta pieza ya no está en curso.» | no aparece | no aparece |

---

## 12. Tokens de diseño actuales (`app/globals.css`)

Se documentan para saber qué se reemplaza. Tema claro único (`color-scheme: light`).

### 12.1 Color
| Token | Valor | Uso |
|---|---|---|
| `--fondo` | `#fbf6f8` | fondo de página (rosado muy claro) |
| `--superficie` | `#fffcfd` | campos, nav, barras fijas, cartas |
| `--hundido` | `#f5ecf0` | segmentado, botón deshabilitado, notas "ocupada" |
| `--tinta` | `#2b1830` | texto (ciruela casi negro) |
| `--apagado` | `#6f5d74` | texto secundario |
| `--linea` | `#eadde4` | bordes y separadores |
| `--acento` | `#b3285f` | frambuesa: único color de acción |
| `--acento-profundo` | `#8e1d4a` | hover del principal |
| `--acento-suave` | `#f6e3ec` | pista del deslizador, confirmaciones, hoy en el mes |
| `--acento-claro` | `#f0b4cd` | «Deshacer» del toast |
| `--sobre-acento` | `#fff7fa` | texto sobre frambuesa |
| `--ok-tinta` / `--ok-fondo` | `#1d6743` / `#e5f3ea` | éxito |
| `--aviso-tinta` / `--aviso-fondo` | `#7a4b00` / `#fdf1dc` | advertencia |
| `--error-tinta` / `--error-fondo` | `#a12a2a` / `#fbe8e6` | error |

Pilares (cada uno un tono `H` en oklch): Pareja 245 (azul), Deseo 320 (magenta), Autoestima 50
(naranja), Límites 160 (verde), Bienestar 85 (amarillo). Derivados: tinte `oklch(0.955 0.028 H)`,
tinte fuerte `oklch(0.91 0.05 H)`, tinta `oklch(0.43 0.09 H)`, punto `oklch(0.62 0.12 H)`.
Nombres largos: «Pareja y conversación», «Deseo y sexualidad», «Autoestima», «Género y límites»,
«Bienestar emocional». Cortos (chips): «Pareja», «Deseo», «Autoestima», «Límites», «Bienestar».

`theme-color` y manifest repiten `#fbf6f8`; ícono usa `#b3285f` / `#fff7fa` (`lib/diseno/marca.ts`).

### 12.2 Tipografía
- Serif: **Young Serif** 400 (títulos de pantalla, títulos de pieza, gancho de la idea, guion,
  frase marcada, nombre en `/l`).
- Sans: **Hanken Grotesk** (todo lo demás).
- Escala:
  | Token | Tamaño / interlineado | Uso |
  |---|---|---|
  | `marca` | 44 px / 1 | nombre en `/l` |
  | `display` | 30 px / 1,12 | títulos de pantalla, gancho de la idea |
  | `title` | 24 px / 1,15 | títulos de Ideas y Video |
  | `script` | 20 px / 1,55 | área del guion |
  | `body` | 18 px / 1,5 | texto base |
  | `label` | 15 px / 1,3 (600) | botones, rótulos de sección, chips |
  | `meta` | 15 px / 1,4 | líneas secundarias |
  Tamaños sueltos frecuentes: 17 px (resúmenes, notas), 16 px (cajas de error, toasts), 20 px
  (títulos de bloque en Ajustes).
- Rótulos de sección: oración normal, 15 px semibold apagado, nunca versalitas.

### 12.3 Forma, sombra, movimiento, espacio
- Radios: `sm` 12 · `md` 14 · `lg` 20 · `xl` 24 · píldora 999.
- Sombra única "flotante": `0 10px 28px -14px rgb(43 24 48 / .45)` (barras fijas, panel del video,
  toasts).
- Curva: `cubic-bezier(0.23, 1, 0.32, 1)`; transiciones 150 a 220 ms; botones se achican a 0,97.
- Foco: contorno 3 px acento con separación 2 px.
- Columna 560 px; margen lateral 18 px; ritmo vertical entre bloques 22 px; dentro de secciones 8
  a 14 px.
- Alturas: botón grande 52 px (ancho completo), chico 44 px, deslizador 60 px con pulgar 52 px,
  filas de lista 64 px mínimo, chips 44 px.
- Íconos: lucide-react (House, ChartColumn, Settings, ChevronLeft, ChevronRight, Search, Plus,
  Minus, Play, Pause, ExternalLink, ArrowRight, Check, Share, SquarePlus).

---

## 13. Componentes compartidos actuales

| # | Componente | Archivo | Dónde | Qué es hoy |
|---|---|---|---|---|
| 13.1 | Botón (`principal`, `línea`, `callado` × `grande`, `chico`) | `components/ui/boton.tsx`, `clases-de-boton.ts` | todas | Principal frambuesa; línea con borde sobre superficie; callado solo texto acento. Deshabilitado sigue enfocable y se ve hundido. Mismas clases para enlaces con forma de botón. |
| 13.2 | Deslizar para aprobar | `components/deslizar-para-aprobar.tsx` | Guion, Video | Rango nativo restilizado; la etiqueta se desvanece al arrastrar; motivo debajo cuando está deshabilitado. |
| 13.3 | Sección | `components/seccion.tsx` | casi todas | `h2` 15 px semibold apagado + contenido, separación 8 px. |
| 13.4 | Nota | `components/nota.tsx` | Inicio, Guion, Video, Ajustes, Calendario, Métricas | Bloque radio 20, padding 16; tipos `ok`, `error` (alert), `ocupada` (hundido), `aviso`. Título semibold en tinta + hijos. |
| 13.5 | Toast | `components/ui/aviso.tsx` | Inicio, Ideas, Guion, Video, Ajustes | Ver 1.7. |
| 13.6 | Fila de pieza | `components/fila-pieza.tsx` | Inicio, Calendario, Métricas | Punto 10 px del pilar, título 18 semibold, meta 15 apagado «… · Pilar», chevron si es tocable, barra esqueleto si trabaja. Alto mínimo 64 px, separador 1 px. |
| 13.7 | Píldora de pilar | `components/ui/pildora-pilar.tsx` | Inicio, Ideas, Guion, Video | Tinte del pilar + punto 7 px + nombre largo. |
| 13.8 | Chip toggle | `components/chip.tsx` | Ideas (buscar), Ajustes (días) | Píldora 44 px con borde; presionado = borde y texto acento sobre acento suave. |
| 13.9 | Chip de alerta | `components/chip-de-alerta.tsx` | Ideas | Píldora advertencia («Verificar dato») o hundida («Nota», «Respaldo débil»). |
| 13.10 | Segmentado | `components/ui/segmentado.tsx`, `vistas-del-calendario.tsx` | Ajustes (meta), Calendario (vistas) | Pista hundida, opción activa en superficie con sombra mínima. |
| 13.11 | Marca de revisión | `components/ui/marca-revision.tsx` | Guion, Video | Ver 5.3. |
| 13.12 | Editor de guion | `components/editor-de-guion.tsx` | Guion | Ver 5.1 punto 3. |
| 13.13 | Ayuda de marcas | `components/ayuda-de-marcas.tsx` | Guion | Dos líneas apagadas. |
| 13.14 | Elegir avatar | `components/elegir-avatar.tsx` | Guion | Grilla 2 columnas de tarjetas radio con foto 3:4. |
| 13.15 | Reproductor de voz | `components/reproductor-voz.tsx` | Guion | Fila con borde: botón 52 px frambuesa play/pausa, barra, «0:12 / 0:52», ayuda «Escucha cómo suena antes de grabar» / «Ya la escuchaste» / «No pude cargar la voz. Recarga la pantalla.» |
| 13.16 | Reproductor de video 9:16 | `components/reproductor-video.tsx` | Video | Ver 6.1 punto 4. |
| 13.17 | Texto de Instagram | `components/texto-de-instagram.tsx` | Video | Caja con el texto + «Editar el texto» + formulario. |
| 13.18 | Mensaje de primera vez | `components/mensaje-primera-vez.tsx` | Video | Nota éxito «Así se ve tu avatar...». |
| 13.19 | Casillas de código | `components/casillas-codigo.tsx` | Ingreso | 6 casillas OTP. |
| 13.20 | Grilla del mes | `components/mes-del-calendario.tsx` | Calendario | Ver 7.1. |
| 13.21 | Agenda | `components/agenda-del-calendario.tsx` | Calendario | Ver 7.2. |
| 13.22 | Ritmo | `components/ritmo-del-calendario.tsx` | Calendario | Ver 7.3. |
| 13.23 | Barra de métrica | `components/barra-de-metrica.tsx` | Métricas | Ver 8.3. |
| 13.24 | Panel de comparación | `components/panel-de-comparacion.tsx` | Métricas | Ver 8.4. |
| 13.25 | Progreso de reels | `components/progreso-de-reels.tsx` | Métricas | 8 segmentos de 8 px de alto. |
| 13.26 | Nav inferior | `components/nav-inferior.tsx` | layout | Ver 1.2. |
| 13.27 | Barra sin conexión | `components/barra-sin-conexion.tsx` | layout | Ver 1.3. |
| 13.28 | Esqueleto | clase `.esqueleto` | Cargando, filas trabajando, Ajustes | Barras redondeadas color línea con pulso. |
| 13.29 | Acciones de estado | `app/(app)/estado-de-pieza.tsx` | Guion y Video sencillos | Botones apilados: el primero principal, el resto callados; «Volver a Inicio» línea. |
| 13.30 | Carta de idea | `app/(app)/ideas/carta-de-idea.tsx` | Ideas | Ver 4.2 punto 3. |
| 13.31 | Bloque de estado | `app/(app)/ajustes/bloque-de-estado.tsx` | Ajustes | Ver 9.2. |

Casillas y radios nativos usan `accent-color` frambuesa (24 px casillas, 20 px radios).

---

## 14. Datos de ejemplo canónicos (para todos los mockups)

Usar siempre estos para que las pantallas cuenten la misma semana. Todos salen de las semillas e2e.

**Piezas**
| Título | Pilar | Estado | Duración |
|---|---|---|---|
| El deseo no se apaga, se esconde | Deseo y sexualidad | guion por aprobar | 52 s, 123 palabras, formato «Mito o realidad» |
| Ser tu propia diosa | Autoestima | video por aprobar | 48 s |
| Puedes decir que no | Género y límites | grabando video | |
| ¿Te achicas para que nadie se incomode? | Autoestima | escribiendo guion | |
| Si van a discutir, siéntense del mismo lado | Pareja y conversación | programado jueves 8 de octubre · 19:00 | |

**Guion de ejemplo** (`tests/fixtures/goldens/2026-09-30-deseo-se-esconde/guion.txt`):
> El deseo en la pareja no se apaga. Se esconde.
>
> Hay un mito que escucho todo el tiempo: si hay amor, el deseo aparece solo. Y cuando no aparece,
> muchas personas sienten que algo anda mal.
>
> Pero en una relación larga, el deseo muchas veces no llega solo. Se esconde detrás del cansancio,
> la rutina, el celular y la lista de pendientes. No es que se haya ido. Es que no tiene dónde
> aparecer.
>
> Te propongo algo para esta semana. Reserva un rato para ustedes dos, sin pantallas y sin hablar de
> pendientes. No tiene que terminar en nada. Conversen, ríanse, abrácense sin apuro.
>
> Y si la falta de deseo te hace sufrir, conversarlo con una profesional también ayuda.
>
> Soy Coni del Rosario.

(Para mostrar marcas de tono, anteponer `[warm]` al primer párrafo y `[pause]` antes de la firma.)

**Texto de la publicación:** «El deseo no se apaga: se esconde detrás del cansancio y la rutina.» +
línea en blanco + «Video hecho con mi avatar digital.»

**Ideas del banco:** las 5 de 3.1 punto 8 + «El deseo no se apaga: se esconde.» (Deseo), «¿Por qué
sientes culpa al descansar?» (Autoestima), «Estar cansada no siempre es cansancio.» (Pareja, nueva
de la semana, respaldo débil, «Por qué» de 4.2). Idea propia: «Tu pareja te revisa el celular y lo
llama amor.» → propone «Género y límites» + «Líneas de ayuda».

**Avatares:** «Estudio», «Terraza».

**Costos y saldos:** voz ~682 caracteres US$ 0,20; video US$ 1,16 (US$ 1,36 con voz incluida);
ElevenLabs 99.000 de 100.000 (o 23.400 en Ajustes), renuevan el 12 de octubre; HeyGen API
US$ 50,00 (o US$ 12,00 en Ajustes); tope US$ 40, llevas US$ 22,00.

**Métricas:** ver 8 (50,4 / 12 / 5 cada 1.000; 1 consulta; 8 toques; 24 s promedio).

**Consultas:** 3 en octubre.

---

## 15. Observaciones para el rediseño

### 15.1 Lo que el nuevo lenguaje obliga a cambiar
- **Tipografía:** Young Serif y Hanken Grotesk salen (serif evitada; Hanken no está en la lista
  Geist / Satoshi / Cabinet Grotesk / Outfit). Hay que resolver sin serif cuatro cosas que hoy se
  apoyan en ella: títulos de pantalla, gancho de la carta de idea, el guion (la "voz de Coni") y la
  frase marcada en la revisión. Mantener 18 px de base y botones de 52 px (accesibilidad declarada).
- **Color:** hoy conviven frambuesa (acción), 5 tonos de pilar con 4 derivados cada uno, y 3 pares
  semánticos. La regla nueva admite un solo acento bajo 80 % de saturación (el frambuesa actual
  `#b3285f` mide cerca de 63 % en HSL, así que podría seguir si se decide). Los pilares deben
  perder protagonismo (punto o rótulo, no fondos teñidos a sangre en Guion, carta de idea y
  agenda) sin perder la regla "el color nunca es la única señal": el nombre del pilar siempre va
  escrito.
- **Neutros:** ya son teñidos (no hay `#fff` ni `#000`); el tinte rosado de `--fondo` es una
  decisión a revisar.
- **Anti-card:** cajas que existen hoy y su justificación posible:
  - Ideas de la semana en Inicio (caja con borde): candidata a lista plana.
  - Carta de idea en Ideas: es el objeto central de la vista, puede quedar como única superficie
    elevada de la pantalla.
  - Panel posterior del video (elevado): jerarquía real (aparece al terminar de ver).
  - Barras fijas de aprobar: jerarquía real.
  - Notas, marcas de revisión, cajas de confirmación (acento suave), bloque de estado de Ajustes,
    hoja de instalación, filas de radio de pilar en idea propia, tarjetas de avatar: revisar una por
    una. No anidar (hoy la hoja de instalación y las notas viven dentro de secciones, y los botones
    de motivo de descarte están dentro de un grupo con borde).
- **Sin degradados de texto ni glow.** El único degradado actual es el oscuro bajo los controles
  del video (legibilidad sobre imagen, no decorativo).

### 15.2 Problemas de UX encontrados en el código (para resolver en los mockups o reportar)
1. **«Descartar esta pieza» no pide confirmación** en ninguna pantalla sencilla, y en "Para subir a
   mano" queda como botón principal frambuesa por ser la única acción. Es destructivo.
2. **Dos botones principales compitiendo:** en Guion por aprobar, «Guardar cambios» (principal)
   vive sobre la barra fija de aprobar; en la barra de grabación, «Grabar voz» y «Grabar video»
   son ambos principales cuando no hay voz.
3. **«Programado» en Inicio no es tocable**, aunque la pantalla de video permite «Cambiar la
   fecha»; solo se llega desde la Agenda del calendario.
4. **Ideas y Calendario no marcan pestaña** activa; no tienen entrada en la nav.
5. **Copia inconsistente sobre cuándo llegan ideas:** Inicio dice «El lunes a las 8:00 te propongo
   5 ideas nuevas.» y el banco vacío dice «El motor propone ideas cada domingo a las 20:00.» Por
   confirmar con Federico cuál es la verdad antes de fijarla en los mockups (no cambiar copy sin
   confirmación).
6. **Dos textos para el tope:** barra de grabación «Súbelo en Ajustes o espera al próximo mes.» y
   video detenido «Súbelo en Ajustes para seguir.» (menor, informativo).
7. `docs/DESIGN.md` dice que el deslizador del guion anuncia «Desliza para aprobar y grabar»; el
   código dice «Desliza para aprobar el guion» (aprobar ya no graba). Manda el código.
8. «Ver calendario» queda como botón suelto entre secciones de Inicio.
9. No hay 404 propio.
10. El motivo del deslizador «Guarda tus cambios antes de aprobar» no lleva punto final, los demás
    sí (detalle de copy, no cambiar sin confirmación).

### 15.3 Lo que no se puede perder
- Lo aprobado se ve completo y tal como sale (video 9:16 con «Avatar IA», texto con «Video hecho
  con mi avatar digital.»).
- El deslizador como único gesto de aprobación, con su motivo visible cuando está deshabilitado.
- Costos y saldos al lado de cada botón que gasta.
- Tamaño de muestra junto a todo orden o comparación en Métricas.
- Objetivos táctiles de 44 px o más; textos de estado siempre escritos (no solo color); reducir
  movimiento; safe-areas del iPhone.
- Tono de Coni: tú, frases cortas, sin entusiasmo artificial; «avísale a Federico» como salida de
  error es parte del copy.

### 15.4 Capturas actuales disponibles (referencia del "antes")
- `~/Projects/estudio-coni/docs/capturas/banco-semana.png` (Ideas, carta con «Por qué» abierto)
- `~/Projects/estudio-coni/test-results/capturas/`: `01-ingreso.png`, `02-ingreso-codigo.png`,
  `ajustes-configurando.png`, `ajustes-editar.png`, `ajustes-instagram-conectado.png`,
  `ajustes-todo-bien.png`, `ajustes-vence.png` (generadas por e2e el 1 de octubre).
