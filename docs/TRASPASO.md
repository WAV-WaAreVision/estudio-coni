# Traspaso de sesión (2026-10-04)

Nota para retomar Conidolly en una sesión nueva. Leer entera antes de tocar nada.

## Qué es esto

- **`~/Projects/estudio-coni`** (repo privado `WAV-WaAreVision/estudio-coni`, rama `main`): la app **Conidolly** (Next.js 16, Supabase, Trigger.dev v4). Coni del Rosario aprueba y publica los reels de su avatar IA con dos puertas humanas.
- **`~/Projects/conidolly-ingesta`** (repo privado `WAV-WaAreVision/conidolly-ingesta`, rama `main`): app aparte para subir material (Soy Coni / Soy WAV), con las pantallas Materiales, Autores, Temas y Semana. Misma base, R2 y Trigger.
- **`~/Projects/coni-heygen`** (rama `contenido/banco-ideas`, sin push): diseño original, curso, `coni.config.json`, modelo de costos.
- Modo de trabajo con Federico: rápido; **subagent-driven development** (un implementador Sonnet por tarea + revisión con `caveman:cavecrew-reviewer`, spec primero y calidad después, y una revisión final Opus por fase); respuestas en **caveman**; mirroring (Orden/Alcance/Supuestos) antes de órdenes no triviales; merge local a `main` con `--no-ff`; push y producción solo cuando Federico lo pide.

## Producción (todo vivo)

| Pieza | Dónde |
|---|---|
| App | **https://conidolly.vercel.app** (Vercel Hobby, equipo `federico-1787s-projects`, proyecto `estudio-coni`). El push **no** despliega solo: `vercel deploy --prod --yes` desde el repo. |
| Ingesta | **https://conidolly-ingesta.vercel.app** (proyecto Vercel `conidolly-ingesta`, mismo equipo; deploy igual, a mano). |
| Base | Supabase `estudio-coni`, ref `mvfytttfxmzzjajecsch`, sa-east-1. Migraciones aplicadas hasta **`20261015000060`** (la regla `aprobada_para_grabar` repuesta con los estados a mano, 15-10-2026). `supabase/pendientes/20261003000350_borrar_vinculos.sql` sigue sin aplicar (a propósito). |
| Tareas | Trigger.dev org WAV, proyecto **`proj_spcwrflbtedwehbvsmhv`** (estudio-coni), versión **`20261008.2`**. Deploy: `TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check` (antes `pnpm install`). |
| Videos y archivos | Cloudflare R2, bucket privado `estudio-coni`, con CORS para la ingesta. |
| Correo | Resend, remitente `Conidolly <avisos@wearevision.cl>`. |
| Usuarios | `federico@wearevision.cl` = cuenta de **Coni** (para probar). `hola@wearevision.cl` = mantenedor. Al lanzar: la cuenta de Coni vuelve a `constanzadelrosario@gmail.com` y `CORREO_CONI` a ese correo. |
| Meta | Instagram **sin conectar a propósito**; rige el modo "subir a mano". |
| Guía para Coni | Artifact privado https://claude.ai/artifact/SLsDP9jQeGJ1vSjQwBQeL9. |

Llaves: nunca leerlas ni imprimirlas, tampoco en la terminal de Federico. Las carga Federico **desde la Terminal de macOS** (pegadas en la terminal de la app de Claude quedaron inválidas dos veces). Después de cambiar una llave: redeploy y verificar con una llamada real, no confiar en "updated".

## Lo que está hecho

- Planes 1 a 6, Plan A (editor y voz), Plan B1 (ingesta) y B2 en producción.
- **C1, base de conocimiento** (spec `docs/superpowers/specs/2026-10-03-conidolly-base-de-conocimiento-design.md`, plan `docs/superpowers/plans/2026-10-03-c1-base-de-conocimiento.md`): autores con alias, roles de material, afirmaciones con cita textual y vector Voyage `voyage-3.5`, temas que se organizan solos (promedio de enlaces, umbral 0.80; calibración en `docs/superpowers/notas/calibracion-c1.md`). En prod: 5 materiales, 385 afirmaciones, 41 temas.
- **C2, motor semanal** (plan `docs/superpowers/plans/2026-10-03-c2-motor-semanal.md`): domingo 20:00 (America/Santiago) más "Proponer ahora" en la pantalla Semana de la ingesta. Elige cruces entre pilares sin IA, Opus escribe teorías en tandas de 3 cruces (cliente propio, 180 s, sin reintentos; `maxDuration` 900), hasta 10 ideas por semana al banco con "Por qué" y descarte con motivo; archiva a las 6 semanas. Primera corrida real (2026-10-03): 8 teorías, 10 ideas, **US$ 0.40**, 3 min.
- Banco viejo de 126 ideas borrado; respaldo en `respaldos/ideas-banco-2026-10-03.json` (excluido de git).
- Arreglos del 2026-10-03: descartar una pieza en error ya funciona; el mensaje de HeyGen sin créditos dice que hay que recargar.
- **Llave de Trigger de Conidolly corregida** (2026-10-03): desde el 1 de octubre apuntaba al proyecto "WAV Ingest v2", así que todo partía 15 a 25 min tarde por la red del mantenimiento. Los 10 runs huérfanos de allá se cancelaron.
- **Aprobar, grabar la voz y grabar el video en tres pasos** (spec `docs/superpowers/specs/2026-10-04-conidolly-aprobar-voz-video-design.md`, plan `docs/superpowers/plans/2026-10-04-aprobar-voz-video.md`, en producción desde 2026-10-04, merge `c6d7d70`): aprobar la puerta 1 ya no gasta nada y deja la pieza en `guion_aprobado`; "Grabar voz" la pasa a `grabando_voz` y corre la tarea `grabar-voz` (ElevenLabs, máquina `small-1x`, cola propia); "Grabar video" arma el render con esa voz. La voz se guarda por texto (`voces/<pieza>/t-<huella>-<toma>.mp3`), así que el mismo guion con la misma voz no se paga dos veces, y el render solo acepta una voz que sea toma del guion aprobado (o la clave antigua de esa misma aprobación). Las pantallas se refrescan solas mientras la pieza trabaja (Guion 4 s, Inicio 8 s). Los saldos de ElevenLabs (caracteres) y de la billetera de API de HeyGen se ven junto a los botones y en Ajustes; si no se pueden leer, no bloquean nada. Mantenimiento: devuelve las voces trabadas (15 min) y solo confirma una reserva de voz cuando existe la voz. Detalle de despliegue en la sección "Production checklist" del plan.
- **C3, fuentes en el guion** (plan `docs/superpowers/plans/2026-10-03-c3-fuentes-en-el-guion.md`, en producción): el guion de una idea del motor recibe su teoría y afirmaciones como inspiración, sin nombres de autores; avisos `copia_de_fuente` (8+ palabras de una cita ajena) y `nombra_autor` (nombre completo o apellido de persona); el respaldo se congela en `piezas.respaldo` y entra al hash de la puerta 1 (fórmula 3).
- **Extracción tolerante** (2026-10-04): el SDK de Anthropic saca los `enum` del JSON schema (quedan solo en la descripción), así que la API no los fuerza. Los enums de afirmaciones, ideas y teorías se normalizan; evidencia desconocida cuenta como "opinion". "Mentora de éxito" (Carmen) quedó lista con 581 afirmaciones.
- **Voz con Eleven v4** (2026-10-04, en `ajustes.produccion.elevenlabs`): `model_id` `eleven_v4` y solo `stability` 0.5 (Natural). Antes: `eleven_multilingual_v2` con estabilidad 0.5, similitud 0.75, estilo 0, refuerzo y velocidad 1. A Federico le gustó: suena con inflexiones. La estimación de costo de voz aún usa la tarifa por carácter de v2.
- **Marcas de tono** (plan `2026-10-04-etiquetas-de-emocion`, en rama `feat/etiquetas-de-emocion`, sin desplegar): el guion trae 3 a 6 marcas `[warm]`... de una lista cerrada (`lib/dominio/etiquetas.ts`). Llegan a ElevenLabs solo con `eleven_v3*`/`eleven_v4*`; nunca a subtítulos, texto de la publicación, conteos ni revisión de Claude. Sin mayúsculas de énfasis: solo puntos suspensivos y `[pause]`. En el texto de la publicación solo bloquea una marca de la lista; otro texto entre corchetes sigue como antes. Puerta 1 incluye las marcas; la huella de voz hashea el texto enviado.
- **Rediseño «Calma suiza»** (2026-10-05, en producción): Geist, neutros cálidos, frambuesa `#a8285a` como único resaltado (errores y avisos incluidos), solo modo claro, botón «Aprobar» además del deslizador, cuentas en `/ajustes/cuentas`, referencias visuales en `tests/e2e/visual.spec.ts`.
- **LinkedIn como destino a mano** (2026-10-06, en producción; spec `docs/superpowers/specs/2026-10-06-conidolly-linkedin-design.md`): texto propio de LinkedIn escrito y revisado con las reglas de `~/Projects/coni-heygen/reports/Marca personal en LinkedIn.md`, destinos elegidos en la puerta 2 (fórmula 2), subir a mano y marcar por red, «Dónde se publica» en Ajustes. Fase 2 (publicación directa por la API) en la sección «LinkedIn fase 2».
- Verde: estudio-coni 1739 unit, 976 integración, 78 E2E; conidolly-ingesta 353 unit, 131 integración, 28 E2E.

## LinkedIn fase 2 (2026-10-07, en la rama `feat/linkedin-fase-2`, sin desplegar)

- Código: `lib/publicacion/linkedin.ts` (`resolverLinkedin`, corre primero dentro de `procesar` de `lib/publicacion/publicar.ts`), `lib/proveedores/linkedin.ts` y `linkedin-oauth.ts`, rutas `/api/linkedin/conectar` y `/api/linkedin/callback`, `lib/mantenimiento/token-linkedin.ts`. El token de 60 días vive en Vault (`linkedin`); no hay refresh, Coni renueva desde Ajustes (aviso a los 14 y 3 días).
- La versión de la API es la constante `VERSION_DE_LINKEDIN` (`lib/proveedores/linkedin.ts`); el mantenimiento nocturno avisa a WAV cuando tiene 10 meses.
- Regla de duda: si se reservó el envío (`enviado_en`) y no volvió el id del post, o falló algo después de enviar, la fila pasa a mano con «revisa tu LinkedIn» y **nunca se reenvía**. Fuera de la media hora aprobada tampoco se reintenta: queda para subir a mano.
- Supuestos sin confirmar en la documentación oficial, que revisa el smoke con el primer post real: F3 (flujo de video por `/rest` para una app de miembro), F9 (enlace `feed/update/urn:li:share:`) y F10 (`sub` del userinfo como id de persona). Si alguno falla, la fila cae a mano (seguro).
- Pasos de Federico (app de LinkedIn, variables de Vercel, `db push`, deploy, smoke): spec `docs/superpowers/specs/2026-10-07-conidolly-linkedin-fase-2-design.md`, secciones «Federico's manual steps» y «Production».

## Siguiente

- Correr el eval del guion (`RUN_EVALS=1`) para ver que el escritor pone las marcas.
- Diccionario de pronunciación para palabras que ElevenLabs diga mal (lo que quedó de la propuesta de etiquetas).
- Calibrar el costo real de HeyGen por segundo (hoy se supone US$ 4/min) antes de grabar el primer video; la billetera de API tiene US$ 5,00. Federico no va a cargar más saldo por ahora.
- Pendientes de Federico: abrir el "Por qué" de una idea del motor y descartar otra con motivo; subir material de **sexualidad** (el motor hoy solo cruza pareja y bienestar) y de los 10 temas con un solo autor que lista la pantalla Semana.
- Aplicar la migración 350 (`borrar_vinculos`) más adelante, moviéndola de `supabase/pendientes/` a `supabase/migrations/`.

## Pendientes fuera de los planes

- Vercel Pro antes de que Coni lo use en serio (hoy Hobby, no permite uso comercial).
- Rotar llaves de Resend (se vieron parcialmente en una captura).
- Probar en iPhone real (push, instalación, descarga para subir a mano, VoiceOver).
- Llevar la parte de argumento de la guía de voz a la línea editorial de guiones.
- Decisiones de costo abiertas: segundo asiento de Vercel para WAV; duración real del reel.

## Reglas que no se negocian

Dos puertas humanas; solo Coni aprueba; nunca publicar fuera de la hora aprobada; llaves fuera del repo; HeyGen solo v3; textos para Coni en español de Chile, tú, sin rayas largas; TDD; nada de `as any`, `@ts-expect-error`, aserciones no nulas ni catch silenciosos; Biome solo en modo seguro; repos privados; commit, push y cambios en producción solo cuando Federico lo pide.
