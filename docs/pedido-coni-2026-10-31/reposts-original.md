# Especificación: entrada de Reposts a Ingesta

Oct 31, 2026 · @ring

Documento para Claude Code y Federico: cómo construir la entrada de posts de Instagram traídos con Repost for Instagram, desde un Atajo de iPhone hasta la bandeja «Reposts» de Ingesta y la base de conocimiento que usa Conidolly.

## Qué se construye y reglas que no se rompen

Se construyen cinco piezas que trabajan juntas: una **entrada con llave segura** en Ingesta, un **panel de llaves**, un **Atajo de iPhone** con selección, un **panel «Reposts»** que funciona como bandeja de espera y un **tipo de material nuevo** que procesa pie, láminas y audio como un solo material. Corresponde a la respuesta 54 del pedido de cambios (parte 2) y se apoya en los cambios 5, 7, 8, 12 y 20.

Stack existente: Next.js, Supabase (Postgres, RLS, Vault), Trigger.dev v4, Cloudflare R2, Claude Sonnet para extracción, ElevenLabs Scribe v2 para transcripción y Voyage para huellas. Los nombres de tablas y módulos existentes que aparecen aquí vienen del mapa de la app: verificarlos contra el repositorio antes de escribir código.

Reglas que no se rompen:

- La app nunca entra a Instagram ni descarga contenido por su cuenta. Todo llega desde el celular de Constanza, enviado por ella.

- Lo que entra por llave queda «por revisar» y **no se procesa ni gasta** hasta que ella lo elige en el panel.

- Todo gasto se estima y se reserva antes de ocurrir, dentro del panel de presupuesto (cambio 12).

- Autor y fuente separados (cambio 5). Constanza nunca figura como autora de estas afirmaciones.

- Los archivos completos (videos e imágenes) se borran de R2 después de procesar; solo quedan el texto extraído, las afirmaciones y una miniatura.

- Las imágenes ajenas nunca se usan en publicaciones. El guion no nombra autores y el crédito va en la línea «Fuente:».

- Revisión de posibles datos de pacientes o de terceros identificables antes de procesar.

- La app nunca responde comentarios ni mensajes, ni publica nada en Instagram.

## Flujo completo

El flujo tiene dos momentos de elección: en el celular se elige qué enviar (sin costo) y en Ingesta qué procesar (con costo estimado).

1.  **Instagram:** Constanza toca el avión de papel y «Copiar enlace».

2.  **Repost for Instagram:** pega el enlace, guarda las fotos o el video en el carrete y copia el pie si la app lo ofrece.

3.  **Atajo «→ Ingesta»:** cuando quiera (en el momento o al final del día), lanza el Atajo, marca los archivos, los agrupa en posts, confirma enlace y pie de cada uno y envía.

4.  **Entrada de Ingesta:** valida la llave, registra el envío y guarda archivos en R2 y datos en la bandeja. No procesa nada.

5.  **Bandeja «Reposts»:** cada post aparece como tarjeta con avisos (posible duplicado, falta enlace, posible dato sensible).

6.  **Elección:** Constanza marca varios y elige entre procesar (ve el costo estimado y confirma), dejar para después (aviso a los 30 días) o descartar (se borra, sin costo).

7.  **Procesamiento:** pie, láminas y audio se leen en paralelo, se arma un texto único y se extraen las afirmaciones una sola vez, con autor y fuente.

8.  **Base de conocimiento:** las afirmaciones entran a temas como cualquier material; los archivos completos se borran de R2.

9.  **Conidolly:** el motor semanal usa esas afirmaciones para teorías, ideas y guiones.

| Momento | Dónde | Costo | Quién decide |
|----|----|----|----|
| Guardar con Repost | iPhone | Ninguno | Constanza |
| Enviar con el Atajo | iPhone → entrada | Ninguno (solo almacenamiento) | Constanza |
| Esperar en la bandeja | Ingesta | Ninguno | — |
| Procesar | Ingesta | Lectura de imágenes, transcripción, extracción y huellas | Constanza, con estimado previo |

## Modelo de datos

Cuatro tablas nuevas y un tipo de material nuevo. Todas con RLS: solo la dueña (y WAV con su rol actual) lee y escribe; la entrada por llave escribe con el rol de servicio, nunca con la sesión del usuario.

-- Llaves de entrada: una por herramienta\
create table llaves_entrada (\
id uuid primary key default gen_random_uuid(),\
nombre text not null, -- "Atajo iPhone"\
hash_llave text not null unique, -- sha256 de la llave; la llave en claro nunca se guarda\
prefijo text not null, -- primeros 8 caracteres, para reconocerla en el panel\
permisos text\[\] not null default '{subir}', -- solo 'subir'\
vence_en timestamptz not null,\
revocada_en timestamptz,\
ultimo_uso_en timestamptz,\
creada_por uuid not null references auth.users(id),\
creada_en timestamptz not null default now()\
);\
\
-- Registro de cada envío recibido por llave\
create table entradas_registro (\
id uuid primary key default gen_random_uuid(),\
llave_id uuid not null references llaves_entrada(id),\
lote_id text not null,\
recibido_en timestamptz not null default now(),\
archivos int not null default 0,\
bytes bigint not null default 0,\
resultado text not null, -- 'ok' \| 'rechazado' \| 'error'\
motivo text\
);\
\
-- Bandeja de reposts (antes de procesar)\
create table reposts_bandeja (\
id uuid primary key default gen_random_uuid(),\
lote_id text not null,\
llave_id uuid references llaves_entrada(id),\
url_original text, -- normalizada: instagram.com/p\|reel/{shortcode}\
shortcode text,\
cuenta_autora text, -- @usuario; null = por confirmar\
formato text check (formato in ('reel','carrusel','foto')),\
pie text,\
fecha_publicacion date,\
avisos text\[\] not null default '{}', -- 'posible_duplicado','falta_enlace','posible_dato_sensible','marca_agua'\
estado text not null default 'por_revisar'\
check (estado in ('por_revisar','para_despues','procesando','listo','descartado','error')),\
costo_estimado_usd numeric(8,4),\
costo_real_usd numeric(8,4),\
material_id uuid, -- material creado al procesar\
vence_en timestamptz not null default now() + interval '30 days',\
creado_en timestamptz not null default now()\
);\
create unique index reposts_shortcode_unico on reposts_bandeja(shortcode)\
where shortcode is not null and estado \<\> 'descartado';\
\
-- Archivos de cada repost (en R2)\
create table reposts_archivos (\
id uuid primary key default gen_random_uuid(),\
repost_id uuid not null references reposts_bandeja(id) on delete cascade,\
orden int not null,\
tipo text not null check (tipo in ('imagen','video')),\
r2_clave text not null,\
bytes bigint not null,\
duracion_s numeric,\
sha256 text not null,\
huella_visual text, -- hash perceptual, bordes recortados 10%\
borrado_en timestamptz -- cuando se eliminó de R2 tras procesar\
);

Cambios en tablas existentes:

- materiales: nuevo valor de tipo instagram_repost, con url_original, cuenta_autora, formato y una miniatura WebP (unos 30 KB) de la primera lámina.

- afirmaciones: cada afirmación guarda ubicacion (por ejemplo «lámina 3» o «0:42») y la etiqueta de origen «ajeno», coherente con el cambio 7 (continuación 2).

- La huella por material (tabla embeddings_ficha, reutilizada según la respuesta 53) se calcula al procesar, para detectar contenido casi igual.

## Llaves y endpoint de entrada

La llave autoriza **solo a subir**: no lee, no lista, no borra ni procesa. Se crea y se revoca desde un panel «Llaves» en Ingesta.

**Panel «Llaves»**

- Botón «Nueva llave»: pide nombre y vencimiento (1, 3, 6 o 12 meses; por defecto 6). Genera 32 bytes aleatorios con prefijo ing\_, muestra la llave **una sola vez** con botón de copiar y guarda solo su hash sha256 y el prefijo.

- Lista de llaves: nombre, prefijo, vence, último uso, envíos del mes, estado (activa, vencida, revocada).

- «Revocar»: efecto inmediato; el siguiente envío con esa llave responde 401.

- Aviso 7 días antes de que venza una llave.

**Endpoint**

POST /api/entrada/reposts (ruta de Next.js, runtime Node). Cabecera Authorization: Bearer ing\_.... Cuerpo multipart/form-data:

| Campo | Tipo | Obligatorio | Notas |
|----|----|----|----|
| lote_id | texto | Sí | Lo genera el Atajo (fecha + número al azar). Un lote = un envío del Atajo. |
| post_index | número | Sí | Agrupa archivos del mismo post dentro del lote (0, 1, 2…). |
| orden | número | Sí | Orden del archivo dentro del post (lámina 1, 2…). |
| archivo | archivo | Sí | JPEG, PNG, HEIC o MP4/MOV. |
| url_original | texto | No | Enlace copiado de Instagram. |
| pie | texto | No | Pie copiado desde Repost. Máximo 5.000 caracteres. |
| origen | texto | Sí | repost-ios. |
| cerrar_lote | booleano | No | En el último envío del lote; dispara la revisión rápida. |

Se acepta un archivo por petición (Atajos manda más fiable así) y la entrada junta los archivos por lote_id + post_index.

**Validaciones**

1.  Llave: buscar por hash; rechazar si no existe, está revocada o vencida (401). Actualizar ultimo_uso_en.

2.  Tamaño: hasta 25 MB por imagen y 300 MB por video; tipo verificado por contenido, no por extensión (415 si no corresponde).

3.  Límite de ritmo: 120 archivos por hora por llave (429).

4.  Normalizar url_original: quitar parámetros, extraer shortcode y deducir formato (/reel/ = reel; /p/ con más de un archivo = carrusel).

5.  Guardar en R2 bajo reposts/{lote_id}/{post_index}/{orden}, calcular sha256 y registrar en entradas_registro.

6.  Con cerrar_lote, lanzar la tarea reposts.revisar_lote (ver procesamiento). Esta tarea **no gasta en modelos**: solo calcula huellas visuales y avisos.

**Respuestas**

- 201 con { lote_id, post_index, archivo_id }.

- 200 con { lote_id, posts: n, avisos: \[...\] } al cerrar el lote.

- 401 llave inválida, 413 archivo grande, 415 tipo no admitido, 429 demasiados envíos, 500 error interno con un codigo legible para el Atajo.

## Atajo de iPhone

Un Atajo llamado «→ Ingesta», compartido por enlace de iCloud. La llave se pide al importarlo (pregunta de importación), así nunca viaja dentro del Atajo compartido. Repost for Instagram es solo para iPhone; en Android se replica con HTTP Shortcuts o Tasker.

**Acciones, en orden**

1.  **Texto (configuración):** URL del endpoint y llave, como preguntas de importación.

2.  **Buscar fotos:** medios creados en las últimas 24 horas (o del álbum de Repost, si la app crea uno), del más nuevo al más antiguo, máximo 40.

3.  **Seleccionar de la lista:** Constanza marca los archivos a enviar (selección múltiple).

4.  **Agrupar:** «¿Todo esto es un solo post?» (Sí / No, son varios). Si son varios, el Atajo pide marcar cuáles van juntos, post por post, y asigna post_index y orden.

5.  **Para cada post:** leer el portapapeles una vez. Si contiene instagram.com, es el enlace; si no, es el pie y se pide el enlace con «Solicitar entrada» (se puede dejar vacío).

6.  **Generar lote_id:** fecha y hora más cuatro dígitos al azar.

7.  **Enviar:** «Obtener contenido de URL», método POST, cabecera Authorization: Bearer \<llave\>, un archivo por petición con sus campos; en la última, cerrar_lote=true.

8.  **Confirmar:** notificación «Enviado: N posts, M archivos». Si alguna petición falla, guardar el lote en un archivo de iCloud y ofrecer «Reintentar» la próxima vez que se abra.

**Uso recomendado**

- Activarlo con doble toque en la parte de atrás del iPhone (Ajustes › Accesibilidad › Tocar › Toque atrás) o con un widget.

- Guardar varios posts con Repost durante el día y enviarlos juntos.

- No iniciar sesión con la cuenta principal de Instagram dentro de Repost si basta con pegar el enlace.

## Panel «Reposts» en Ingesta

Una pantalla nueva en Ingesta, en el menú junto a Materiales. Es la bandeja donde Constanza decide qué entra a su base.

**Cabecera**

- Posts esperando, posts para después y posts procesados este mes.

- Costo estimado de lo marcado y presupuesto disponible de la línea «procesamiento de material» (cambio 12).

- Cuentas más traídas del mes.

**Tarjeta por post**

- Miniatura de la primera lámina o del primer cuadro del reel.

- @cuenta autora (editable; «por confirmar» si falta), formato (editable), fecha de envío.

- Avisos como chips: posible duplicado (con enlace al post o material existente), falta enlace, posible dato sensible, marca de agua.

- Casilla para marcar, y botón «Ver» que abre el detalle: todas las láminas, el pie, el enlace original (abre en una pestaña nueva) y campos para corregir.

**Estados**

| Estado | Qué significa | Siguiente |
|----|----|----|
| Por revisar | Llegó y espera decisión | Procesar, para después o descartar |
| Para después | Ella lo dejó en espera | Aviso a los 30 días antes de borrarse |
| Procesando | Tarea en curso | Listo o error |
| Listo | Ya es material con afirmaciones | Abrir material, olvidar |
| Descartado | Borrado, sin costo | — |
| Error | Falló la lectura o la transcripción | Reintentar o descartar |

**Acciones**

- **Procesar seleccionados:** muestra el estimado total y por post (imágenes, minutos de audio, extracción); al confirmar reserva el monto y encola el procesamiento. Si supera el tope, avisa y deja seguir con un toque (cambio 12).

- **Para después** y **Descartar**, individuales o en grupo. Descartar borra los archivos de R2.

- **Corregir antes de procesar:** enlace, @cuenta autora, formato, y unir o separar posts mal agrupados por el Atajo.

- **Olvidar este post** (en estado Listo): borra el material, sus afirmaciones y la miniatura.

- **Filtros:** cuenta, formato, estado, fecha y aviso.

**Vista después de procesar:** cada tarjeta muestra cuántas afirmaciones salieron, a qué temas fueron y su costo real frente al estimado.

## Procesamiento, duplicados, presupuesto y medidas

**Tarea reposts.revisar_lote (al cerrar el lote, sin costo de modelos)**

1.  Calcular sha256 y huella visual de cada imagen (y de 3 cuadros de cada video), recortando 10% de bordes para que la marca de agua no altere la huella.

2.  Avisos: mismo shortcode ya existente = posible duplicado (con enlace); sha256 igual = duplicado seguro; huella visual a distancia ≤ 8 = posible duplicado; sin enlace = falta enlace.

3.  Crear la miniatura WebP de la primera lámina o cuadro.

4.  Calcular el costo estimado por post y guardarlo en costo_estimado_usd.

**Tarea reposts.procesar (solo cuando Constanza confirma)**

1.  Reservar el monto en el panel de presupuesto. Si el gasto real supera el estimado en más de 20%, pausar y preguntar.

2.  En paralelo:

    - **Pie:** limpiar emojis decorativos; los hashtags se guardan aparte como etiquetas de referencia.

    - **Láminas:** Claude lee cada imagen en orden y devuelve el texto literal y una descripción de una línea. Instrucción explícita: ignorar marcas de agua, logos y @ sobreimpresos en esquinas.

    - **Audio del reel:** Scribe v2. Si salen menos de 15 palabras (solo música), marcar «sin habla» y no cobrar extracción sobre el audio. Leer 3 cuadros para captar texto en pantalla.

3.  Revisión de datos sensibles: si aparecen datos de pacientes, menores o terceros identificables, detener y marcar el post para revisión (no se extrae nada).

4.  Armar un texto único con secciones \[PIE\] \[LÁMINA 1…n\] \[AUDIO\] \[TEXTO EN PANTALLA\].

5.  Extraer afirmaciones una sola vez con las instrucciones vigentes (cambios 6 y 7), guardando la ubicacion de cada cita.

6.  Autor y fuente: la fuente es el post (enlace, @cuenta, fecha); el autor es la @cuenta, salvo que una lámina cite a otra persona, que pasa a ser la autora con la cuenta como fuente. Etiqueta de origen «ajeno».

7.  Huellas Voyage de las afirmaciones y de la huella por material; transcripción casi igual a otra (similitud \> 0,95) queda como posible duplicado.

8.  Crear el material instagram_repost, pasar el post a «Listo» y guardar el costo real.

9.  Borrar de R2 los archivos completos y marcar borrado_en. También se borran los que sigan «por revisar» o «para después» a los 30 días, con aviso 3 días antes.

**Crédito en lo que se publique**

Regla: si la idea es de otra persona, se nombra; si la frase es de otra persona, no se usa. Conidolly reformula con la voz de Constanza, las citas literales no pasan de 25 palabras y la línea «Fuente: Nombre (@cuenta), tema, año» la agrega la app (cambio 5). Las imágenes ajenas nunca se usan en publicaciones.

**Medidas por cada 1.000 (respuesta 57)**

La app ya calcula guardados ÷ alcance × 1.000. Agregar, con el mismo patrón:

- **Instagram:** enviados ÷ alcance × 1.000 (la señal más fuerte para la etapa Descubrir).

- **LinkedIn:** interacciones (reacciones + comentarios + compartidos) ÷ impresiones × 1.000.

Ambas alimentan la receta del motor (cambio 16) y el panel del funnel (cambio 20). Costo: ninguno.

## Pruebas, etapas y pendientes

**Pruebas de aceptación**

- [ ] Una llave revocada o vencida recibe 401 y queda en el registro.

- [ ] Un envío con llave no aparece en Materiales ni gasta: solo aparece en Reposts como «por revisar».

- [ ] Un carrusel de 8 láminas enviado en 8 peticiones queda como un solo post, en orden.

- [ ] El mismo enlace enviado dos veces muestra «posible duplicado» con enlace al primero.

- [ ] «Procesar seleccionados» muestra el estimado antes de confirmar y reserva el monto.

- [ ] Un reel solo con música queda «sin habla» y no cobra extracción del audio.

- [ ] Cada afirmación de un repost tiene autor, fuente, ubicación y origen «ajeno»; ninguna queda con autora Constanza.

- [ ] Tras procesar, los archivos completos ya no están en R2 y la miniatura sí.

- [ ] «Olvidar este post» borra material, afirmaciones y miniatura.

- [ ] Un post con un dato de paciente se detiene antes de extraer.

- [ ] Las medidas de enviados e interacciones por cada 1.000 se ven en el detalle de cada pieza.

**Etapas**

| Etapa | Qué incluye | Depende de |
|----|----|----|
| 1 | Tablas, panel Llaves y endpoint de entrada | — |
| 2 | Atajo de iPhone y prueba con 10 posts reales | Etapa 1 |
| 3 | Panel Reposts con revisión rápida, sin procesar | Etapa 1 |
| 4 | Procesamiento completo, presupuesto y borrado en R2 | Etapas 3, cambio 12 |
| 5 | Medidas por cada 1.000 en métricas | Independiente |

**Por probar en el celular de Constanza antes de la etapa 2**

- ¿Repost detecta solo el enlace del portapapeles o hay que pegarlo?

- ¿Entrega el pie original y la @cuenta, o solo pies generados con IA?

- ¿Pone marca de agua en el plan gratis y se puede apagar?

- ¿Guarda el carrusel completo en el carrete y en un álbum propio?

- ¿Los videos quedan en el carrete o solo dentro de la app?

- ¿Aparece en el menú Compartir de Instagram?

- ¿Qué funciones están detrás del pago?

- ¿Atajos envía bien videos de más de 50 MB?

**Pendientes para Federico**

- Confirmar los nombres reales de materiales y afirmaciones y dónde vive la huella por material.

- Confirmar límites de tamaño del runtime de Next.js para subidas grandes; si no alcanza, usar URL firmada de R2 para el video.

- Los umbrales (distancia 8, similitud 0,95, 15 palabras, 25 palabras, 30 días) son puntos de partida para ajustar con uso.

Orientación legal, no asesoría: uso privado de estudio dentro de Ingesta, cuentas públicas, cita breve con autor y fuente (Ley 17.336, art. 71 B).
