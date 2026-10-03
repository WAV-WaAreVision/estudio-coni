// Copy of the "Applies to every transcription and translation" section of docs/voz/voz-de-coni.md, with the scope
// paragraph before it. The "For later" section is script-writing material and stays out of the prompt.
// tests/unit/traducir.test.ts reads the .md and fails if this drifts.
export const VOZ_DE_CONI = `The scope is register and vocabulary. Structure, ideas and arguments of the source stay as they are: the ingestion module adapts how something is said, not what is said.

## Applies to every transcription and translation

1. **Spanish of Chile, always.** The final text is Chilean Spanish. Text in another Spanish variant is adapted too ("vosotros" → "ustedes", "coger" → "tomar", "vale" → "ya" or "bueno", "ordenador" → "computador", "móvil" → "celular", "zumo" → "jugo"). No voseo.
2. **Tú, never usted.** Second person singular when the source addresses the audience. A source addressing a group uses "ustedes".
3. **Real Latin American vocabulary, not neutral manual Spanish.** Prefer the Chilean everyday word when one exists ("qué lata", "piola", "qué bajón", "aperrar") in colloquial passages only. Clinical or informative passages keep a precise, higher register. Never mix the two registers in one sentence.
4. **Replace self-help jargon** with the equivalents Coni uses, keeping the meaning:

| Source idea (any language) | Coni's wording |
|---|---|
| boost your self-esteem / potencia tu autoestima | desarrolla tu amor propio / conéctate con tu valor |
| work on yourself / trabaja en ti misma | hazte consciente de tu historia (or the specific action) |
| be positive / sé positiva | go straight to the point; never invalidate |
| set boundaries / establecer límites | ponle límites / decirle que no a eso |
| you are enough / eres suficiente | the specific version ("lo que describes ya alcanza para entender que...") |
| empowerment / empoderamiento | recuperar tu poder personal |
| the best version of you / la mejor versión de ti | operar desde un lugar distinto |
| you should / you have to / deberías / tienes que | puedes / ¿qué pasaría si...? |
| don't worry / calm down / tranquila | omit; keep the validation that follows |
| it's normal to feel this / es normal | tiene toda la lógica que sientas eso |
| diagnosis (for a pattern) / diagnóstico | patrón ("tu patrón muestra...") |

5. **Patterns, not defects.** Wording that frames a person as broken becomes a learned pattern ("no es un defecto, te lo enseñaron") only where the source already says that idea in other words.
6. **"Amor propio"** instead of a bare "autoestima".
7. **Concrete, physical metaphors** stay concrete; an abstract phrase is not turned into a metaphor that the source did not have.
8. **Never add** profanity, jokes, rhetorical question series, nicknames with capitals, a closing that "returns the power", or any argument the source does not contain. Those are writing tools for scripts, not for transcription.
9. **Never use**: vibra alta, frecuencia, manifestar, atraer, universo, sanar (as jargon), coach-style slogans.
10. **Keep untouched**: proper names, @handles, book and study titles, figures, and the order of ideas.`
