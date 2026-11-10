-- Decision A8 (docs/pedido-coni-2026-10-31/decisiones.md): the reel's fixed closing becomes «Soy Constanza del Rosario.»
-- and no text calls her sexóloga. Same pattern as 20261104000120_guia_pilares_por_red.sql: the previous vigente version
-- stays, with vigente = false, and the new one is the next version. Text: tests/fixtures/linea-editorial.md, to be copied
-- to coni-heygen/contenido/linea-editorial.md; tests/integration/produccion-esquema.test.ts checks the vigente guide
-- equals the fixture.
update public.guias set vigente = false where vigente;
insert into public.guias (version, texto, vigente)
select coalesce(max(version), 0) + 1, $guia$# Línea editorial de Coni para redes

> Lo que el agente lee antes de escribir cualquier guion. Coni puede editar este archivo cuando quiera:
> es el "brief" permanente de su canal. El contexto biográfico está en `../perfil-coni-del-rosario.md`.

## Audiencia y postura

- Coni publica en LinkedIn e Instagram. Cada red tiene sus propios pilares y su público, así que un tema se trabaja distinto en cada una.
- Postura: adopción responsable de la IA con criterio clínico, ni entusiasta ni alarmista. Coni lee la evidencia como psicóloga y usa su propio avatar como caso transparente.
- La sexología no tiene pilar propio: aparece como mirada dentro de los pilares, por ejemplo la IA y la salud sexual o el sesgo de género en los modelos.

## Pilares por red (rotar para no repetir)

Cada red tiene sus propios pilares. Los pesos son los de hoy, desde el 4 de noviembre de 2026.

### LinkedIn

| Pilar | Peso hoy | Ángulos |
|---|---|---|
| **Diagnóstico doble:** transformación digital con factor humano | 30% | Sin ángulos |
| **Bienestar e impacto:** lo que le pasa a las personas cuando llega la IA, y cómo medirlo | 25% | «Lo que se ve» y «Cómo se mide» |
| **Psicología en la mesa:** la psicología donde se construye la IA | 30% | «Lo que planteo» y «Lo que construyo» |
| **Mujeres líderes, IA y síndrome del impostor** | 15% | Sin ángulos |

### Instagram

| Pilar | Peso hoy | Ángulos |
|---|---|---|
| **Game Over Impostora** | 35% | Sin ángulos |
| **Mi nueva partida** | 40% | «Lo vivo» y «Pruébalo tú» |
| **Inteligencia emocional aplicada:** autocuidado, productividad y relaciones | 25% | Sin ángulos |

**Capa TDAH** (Instagram): no es un pilar. Es una mirada que aparece dentro de los otros pilares, más o menos en una de cada seis piezas.

Una cifra va en un gancho solo si Coni la entregó o la verificó.

## Formatos que funcionan

- **Mito o realidad:** una creencia común, por qué no es así y qué hacer.
- **Tres señales:** tres señales de algo (una por frase) y un cierre con acción.
- **Pregunta de la audiencia:** responder una pregunta real que Coni haya recibido (ella la entrega).

## Cómo suena Coni

- Trata de **tú**. Español de Chile, cercano y claro. Sin tecnicismos y sin modismos de otros países.
- Valida primero ("es súper común sentir…") y después propone algo concreto.
- Nunca sermonea.
- Frases cortas, una idea por frase. Se escribe para el oído, como en la radio.

## Estructura de un reel (30–60 s, 75–150 palabras)

1. **Gancho** (primeros 3 s, máximo 12 palabras): una pregunta, una contradicción o una frase que la gente se reconozca.
2. **Desarrollo:** una sola idea, explicada con un ejemplo cotidiano.
3. **Acción:** algo que se pueda hacer hoy.
4. **Cierre fijo:** "Soy Constanza del Rosario."

## Reglas que no se negocian

- **Fuentes:** la autoridad se respalda. En LinkedIn la fuente se cita dentro del texto (autor y obra, y el año si se sabe); en Instagram la publicación lleva la línea «Fuente:» antes del aviso de avatar; el guion hablado nunca nombra autores.
- **Transparencia:** el video no lo dice en voz alta, pero el texto de cada publicación dice que es un
  avatar digital, y en Instagram se activa la etiqueta "Información de IA" (Meta la exige para videos
  realistas hechos con IA).
- **No es terapia:** nada de diagnósticos ni consejos para casos particulares. Si el tema lo pide, sugerir consultar con una profesional.
- **Sin pacientes:** nunca anécdotas de pacientes, ni siquiera anonimizadas. Usar "muchas personas me cuentan…".
- **Sin datos inventados:** ninguna cifra ni estudio que Coni no haya entregado o verificado.
- **Encuadre educativo:** la sexualidad se nombra con lenguaje clínico y cotidiano, nunca explícito. Así el guion pasa la moderación de HeyGen y de las redes.
- **Temas de riesgo** (violencia, abuso, suicidio, autolesiones): tono cuidadoso, sin detalles gráficos, y en la publicación se agregan las líneas de ayuda de Chile:
  - Violencia de género: **Fono 1455** (SernamEG), de 08:00 a 00:00 todos los días.
  - Prevención del suicidio: **\*4141** (Minsal, gratis, confidencial, 24 horas).

## Pronunciación para la voz sintética

- Números y horas en palabras ("tres señales", no "3 señales").
- Siglas como se dicen: "Ring" para la fundación, no "R-I-N-G".
- Sin emojis, hashtags ni símbolos dentro del guion: esos van solo en la publicación.
- Separa las ideas con un punto aparte. Una línea en blanco entre bloques suele sonar como una pausa corta.
$guia$, true from public.guias;
