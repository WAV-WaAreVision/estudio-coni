# Traspaso de sesión (2026-10-02)

Nota para retomar Conidolly en una sesión nueva. Leer entera antes de tocar nada.

## Qué es esto

- **`~/Projects/estudio-coni`** (repo privado `WAV-WaAreVision/estudio-coni`, rama `main`): la app **Conidolly** (Next.js 16, Supabase, Trigger.dev v4). Coni del Rosario aprueba y publica los reels de su avatar IA con dos puertas humanas.
- **`~/Projects/coni-heygen`** (rama `contenido/banco-ideas`, sin push): diseño original, banco de ideas, `coni.config.json`, modelo de costos. Tiene un `supabase/.temp` sin trackear que es basura de la CLI; se puede ignorar.
- Modo de trabajo acordado con Federico: rápido; **subagent-driven development** (un implementador Sonnet por tarea + revisión con `caveman:cavecrew-reviewer`: primero spec, después calidad); respuestas en **caveman**; merge local a `main` con `--no-ff`; push y producción solo cuando Federico lo pide; mirroring (Orden/Alcance/Supuestos) antes de órdenes no triviales.

## Producción (todo vivo)

| Pieza | Dónde |
|---|---|
| App | **https://conidolly.vercel.app** (Vercel Hobby, equipo `federico-1787s-projects`, proyecto `estudio-coni`). `estudio-coni.vercel.app` redirige con 308. |
| Base | Supabase `estudio-coni`, ref `mvfytttfxmzzjajecsch`, sa-east-1, org WAV (Pro). Linkeado en el repo. Migraciones hasta `20261002000112` aplicadas. |
| Tareas | Trigger.dev org WAV, proyecto `proj_spcwrflbtedwehbvsmhv`, versión `20261002.2`, runtime Node 24. |
| Videos y respaldo | Cloudflare R2, bucket privado `estudio-coni` (cuenta `98e22aecf3c9bb49b0fa7947e66716f8`). Respaldo nocturno con pg_dump probado. |
| Correo | Resend, dominio `wearevision.cl` verificado (DKIM, SPF en `send`, DMARC p=none). Remitente `Conidolly <avisos@wearevision.cl>`. |
| Usuarios | `federico@wearevision.cl` = cuenta de **Coni** (para probar; recibe los códigos). `hola@wearevision.cl` = mantenedor. Al lanzar con Coni: su cuenta vuelve a `constanzadelrosario@gmail.com` y `CORREO_CONI` a ese correo. |
| Meta | App "Estudio de Coni" de Federico; Instagram app id `1090659133511064`; redirect URIs `conidolly.vercel.app` y `estudio-coni.vercel.app` `/api/meta/callback`; permisos basic, content_publish, manage_insights. **Instagram sin conectar a propósito**: mientras tanto rige el modo "subir a mano". |
| Avatares | Lista curada en `ajustes.produccion.heygen.avatares`: Podcast (`998bb0630f764cebb937c28c0a0fc606`) y Natural (`d8b284f68e144c92aee17abeca000a00`). Voz ElevenLabs `F2SkAeaaVSlAUrRS3rDg`. Banco de 130 ideas importado. |
| Guía para Coni | Artifact privado https://claude.ai/artifact/SLsDP9jQeGJ1vSjQwBQeL9 (fuente en el scratchpad de la sesión anterior; si hay que editarla, leerla con Artifact `read` y republicar en esa URL). |

Llaves: nunca leerlas ni imprimirlas. Las de proveedores (Claude, HeyGen, ElevenLabs) se cargan en Ajustes de la app (Vault). Vercel y Trigger tienen sus env cargadas por Federico. El modo automático bloquea `vercel env rm` y escrituras en `auth.users`: darle a Federico el comando.

## Lo que está hecho (en `main`, pusheado hasta `83bb7e1`)

Planes 1 a 6, subir a mano, elegir avatar, y **Plan A** (`docs/superpowers/plans/2026-10-02-conidolly-editor-y-voz.md`, con "Plan A notes"): renombre a Conidolly, editor de guion con versiones, voz generada solo después de la puerta 1 (clave determinista, sin doble cobro), 1 a 5 ideas, costo con voz. Verde: 1264 unit, 584 integración, 69 E2E.

## Siguiente: Plan B, módulo de ingesta (escrito, sin empezar)

- Spec: `docs/superpowers/specs/2026-10-02-conidolly-ingesta-design.md`.
- Plan: `docs/superpowers/plans/2026-10-02-ingesta.md` (fases B1 materiales y fichas, B2 grafo y teorías, B3 fuentes en Guion; 18 tareas + 5b, 5c).
- Reglas de voz para transcribir/traducir: `docs/voz/voz-de-coni.md` (destilado de la guía de voz de Coni para chatbot, uso reservado: no publicar).
- Decisiones ya tomadas: app aparte `conidolly-ingesta.vercel.app`, misma base/R2/Trigger; ingreso con botones "Soy Coni" / "Soy WAV"; materiales documento, link, audio, video, imagen (hasta 20), post; video en dos pistas (Scribe para la voz + fotogramas leídos por Claude visión para subtítulos quemados); toda transcripción traducida y adaptada a la voz de Coni en español de Chile (también otras variantes del español), sin agregar ideas; nunca descargar de Instagram/TikTok (el usuario sube el archivo); embeddings Voyage `voyage-3.5` + pgvector; fuentes solo como inspiración, regla de copia de 8 palabras.
- **4 commits de docs sin push** (`e8bedb2`, `0d83862`, `080dc6d`, `c4914d9`). Pushear al retomar si Federico está de acuerdo.
- Antes de B2, Federico crea la cuenta de Voyage y carga `VOYAGE_API_KEY` en Trigger.dev.

## Pendientes fuera del Plan B

- Vercel Pro antes de que Coni lo use en serio (hoy Hobby, no permite uso comercial).
- Rotar llaves de R2 y Resend (se vieron parcialmente en una captura).
- Llave de HeyGen en Ajustes para grabar el primer reel; probar en iPhone real (push, instalación, descarga para subir a mano, VoiceOver).
- Propuesta pendiente: llevar la parte de argumento de la guía de voz (Espejo → Nombre → Origen → Poder, etc.) a la línea editorial de guiones.
- Decisiones de costo abiertas: segundo asiento de Vercel para WAV; duración real del reel (49 s vs 40 s del modelo).

## Reglas que no se negocian

Dos puertas humanas; solo Coni aprueba; nunca publicar fuera de la hora aprobada; llaves fuera del repo; HeyGen solo v3; textos para Coni en español de Chile, tú, sin rayas largas; TDD; nada de `as any`, `@ts-expect-error`, aserciones no nulas ni catch silenciosos; Biome solo en modo seguro; repos privados; commit, push y cambios en producción solo cuando Federico lo pide.
