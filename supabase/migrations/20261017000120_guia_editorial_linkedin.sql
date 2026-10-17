-- The editorial guide every prompt reads moves to the LinkedIn pillars (spec 2026-10-17, decision 10;
-- amendment 10). Text: tests/fixtures/linea-editorial.md, a copy of coni-heygen/contenido/linea-editorial.md;
-- the integration tests compare both. Production gets it as the next version; a fresh database as version 1.
update public.guias set vigente = false where vigente;
insert into public.guias (version, texto, vigente)
select coalesce(max(version), 0) + 1, $guia$# Línea editorial de Coni para redes

> Lo que el agente lee antes de escribir cualquier guion. Coni puede editar este archivo cuando quiera:
> es el "brief" permanente de su canal. El contexto biográfico está en `../perfil-coni-del-rosario.md`.

## Audiencia y postura

- Coni publica sobre todo en LinkedIn, para colegas: psicólogos, médicos y el ecosistema de salud mental y tecnología. El mismo contenido va en video a Instagram.
- Postura: adopción responsable de la IA con criterio clínico, ni entusiasta ni alarmista. Coni lee la evidencia como psicóloga y usa su propio avatar como caso transparente.
- La sexología no tiene pilar propio: aparece como mirada dentro de los pilares, por ejemplo la IA y la salud sexual o el sesgo de género en los modelos.

## Pilares (rotar para no repetir)

| Pilar | De qué se trata | Ejemplo de gancho |
|---|---|---|
| **IA y salud mental** | Qué dice la evidencia sobre chatbots, apps y modelos: uso real, beneficios y riesgos. | "Una de cada cuatro personas ya usa IA para su salud mental." |
| **Práctica clínica aumentada** | Cómo cambia la consulta: herramientas, cuándo sí y cuándo no, y el rol del vínculo terapéutico. | "La IA en terapia debería aprender como los autos autónomos." |
| **Ética y regulación** | Consentimiento, privacidad, sesgos, responsabilidad profesional y regulación en Chile y el mundo. | "Las apps de bienestar emocional reciben datos de salud y casi nadie las regula." |
| **Acceso y salud pública** | Brechas de atención, escala, equidad, y salud mental en el trabajo y la educación. | "Hay muy pocos profesionales de salud mental por persona, y los chatbots llenan ese hueco." |
| **Caso Coni: humana + avatar** | Su propio experimento: qué aprende usando un avatar con transparencia y qué funciona y qué no. | "Uso un avatar de IA para divulgar. Esto es lo que decidí no delegarle." |

## Formatos que funcionan

- **Mito o realidad:** una creencia común, por qué no es así y qué hacer.
- **Tres señales:** tres señales de algo (una por frase) y un cierre con acción.
- **Ejercicio de la semana:** una práctica concreta para hacer con la pareja o a solas.
- **Pregunta de la audiencia:** responder una pregunta real que Coni haya recibido (ella la entrega).
- **Idea de sus libros:** una idea de *Si la cama hablara…* o *Soy mi propia diosa*, dicha con sus palabras.

## Cómo suena Coni

- Trata de **tú**. Español de Chile, cercano y claro. Sin tecnicismos y sin modismos de otros países.
- Valida primero ("es súper común sentir…") y después propone algo concreto.
- Mirada de género explícita, con humor y calidez. Nunca sermonea.
- Frases cortas, una idea por frase. Se escribe para el oído, como en la radio.

## Estructura de un reel (30–60 s, 75–150 palabras)

1. **Gancho** (primeros 3 s, máximo 12 palabras): una pregunta, una contradicción o una frase que la gente se reconozca.
2. **Desarrollo:** una sola idea, explicada con un ejemplo cotidiano.
3. **Acción:** algo que se pueda hacer hoy.
4. **Cierre fijo:** "Soy Coni del Rosario."

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
  - Violencia contra la mujer: **Fono 1455** (SernamEG).
  - Prevención del suicidio: **\*4141** (Minsal, gratis, 24 horas).
  - Emergencias: **133** (Carabineros).

## Pronunciación para la voz sintética

- Números y horas en palabras ("tres señales", no "3 señales").
- Siglas como se dicen: "Ring" para la fundación, no "R-I-N-G".
- Sin emojis, hashtags ni símbolos dentro del guion: esos van solo en la publicación.
- Separa las ideas con un punto aparte. Una línea en blanco entre bloques suele sonar como una pausa corta.
$guia$, true from public.guias;
