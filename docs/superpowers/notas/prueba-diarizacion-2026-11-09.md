# Prueba de transcripción con hablantes: ElevenLabs y Gemini (09-11-2026)

Prueba previa al cambio 5 (#20), decisiones B3 y B4. Hecha a mano en una carpeta temporal, sin código del repo.

## Caso

«Virtual Therapy? Navigating AI-Powered Interventions for Mental Health», Center for Bioethics de Harvard Medical
School, https://www.youtube.com/watch?v=z2TSHNK8fY8 (89:38, inglés, diciembre de 2025, licencia Creative Commons
Atribución). Hablan Rebecca Brendel (moderadora), Marlynn Wei y Andrew Clark. Los capítulos del video sirven de
respuesta correcta: 0:00 Brendel, 3:53 Wei, 32:18 Brendel, 33:20 Clark, 59:18 panel.

## Resultados

| | ElevenLabs `scribe_v1`, archivo m4a | Gemini `gemini-3.8-flash`, enlace de YouTube |
|---|---|---|
| Hablantes | 3 de 3, sin indicar cuántos | 3 de 3 |
| Nombres | No (speaker_0..2) | Sí, correctos («Marlynn» bien escrito) |
| Tramo de Wei | 97 % la voz correcta | 100 % |
| Tramo de Clark | 99 % | 90 %, tiempos corridos |
| Panel (Brendel / Clark / Wei) | 51 / 27 / 22 %, 30 turnos | 51 / 27 / 22 %, 26 turnos |
| Tiempos | Por palabra, exactos | Por segmento; el primer tramo se saltó 41:30 a 44:50 sin avisar y corrió los tiempos hasta 4 min |
| Palabras | 16.404 | 15.197 (93 % de los subtítulos automáticos) |
| Tiempo | 67 s para los 90 min | ~12 min (dos tramos de 45 min) más 3 reintentos por 503 |
| Costo aproximado | ~US$ 0,35 | ~US$ 0,46; US$ 0,09 si el enlace de YouTube sigue sin cobro en preview |

Notas:
- `gemini-2.5-flash` ya no está disponible para cuentas nuevas (404). `gemini-3.8-flash` cuesta US$ 0,75 por millón de
  tokens de entrada y US$ 3,75 de salida hasta el 31-12-2026; desde el 01-01-2027 se duplica.
- La lectura de enlaces de YouTube en Gemini está en preview y solo sirve para videos públicos.
- Descargar videos de YouTube desde el servidor no es viable (bloqueos a IP de nube) ni deseable (términos de uso).

## Recomendación para el cambio 5

1. Transcripción con hablantes: ElevenLabs, desde el archivo en R2. Es el camino que ya existe para lo que sube Coni.
2. Nombres de los hablantes: Claude, leyendo las presentaciones en la transcripción; Coni confirma con un toque.
3. Gemini por enlace solo para videos públicos de YouTube, en tramos de unos 20 minutos con traslape y validando la
   cobertura contra la duración para detectar saltos.
