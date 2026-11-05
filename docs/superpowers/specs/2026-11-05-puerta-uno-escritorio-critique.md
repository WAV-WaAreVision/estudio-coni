# Puerta 1 en computador: critique

> `/impeccable critique` sobre `/guion/[id]` en estado `guion_por_aprobar`, a 1280 x 900
> (`app/(app)/guion/[id]/pantalla-guion.tsx`). Contexto: `docs/PRODUCT.md` y `docs/DESIGN.md` (registro product).
> Pedido de Federico (05-11-2026): "no se aprovecha todo el ancho de escritorio, revísalo con algún skill de UX para
> reordenarlo y mejorar el UX".

## Evaluaciones

- **A (revisión de diseño):** captura `guion-por-aprobar-angulo-escritorio.png` y el código de la pantalla.
- **B (detector determinista):** `npx impeccable detect --json` sobre `pantalla-guion.tsx` y `barra-de-firma.tsx`:
  sin hallazgos (`[]`). No hay tics de "hecho por IA": sin degradados, sin vidrio, sin grillas de cartas.

## Design Health Score

| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | «Falta:» dice qué cierra la firma, pero en computador queda lejos de los pasos que nombra |
| 2 | Lenguaje del mundo real | 4 | Pasos numerados en sus palabras, tú, sin jerga |
| 3 | Control y libertad | 3 | Deshacer 8 s y descartar con confirmación en línea |
| 4 | Consistencia | 3 | La barra de firma usa el patrón del teléfono (hoja fija abajo) en una pantalla ancha |
| 5 | Prevención de errores | 3 | La firma exige voz escuchada y avatar; el guion queda tapado mientras lee |
| 6 | Reconocer antes que recordar | 2 | Para firmar hay que recordar el paso 1 (arriba) y el 3 (abajo) con la barra en medio |
| 7 | Flexibilidad y eficiencia | 2 | Todo en una columna de 560 px: lee, sube a escuchar, baja a elegir, vuelve a la barra |
| 8 | Estética y minimalismo | 3 | Sobrio y en relieve; el ancho vacío (unos 720 px de piedra) hace ver la pantalla como un teléfono estirado |
| 9 | Recuperación de errores | 3 | Bloques de error en sus palabras con «Detalle para WAV» |
| 10 | Ayuda | 3 | La línea de costo y «o toca dos veces» explican la firma |
| **Total** | | **29/40** | **Bueno, con un problema de composición en computador** |

## Impresión general

En el teléfono la pantalla funciona: una columna, la firma pegada abajo. En computador es la misma columna centrada,
y la hoja de firma flota encima del guion, que es justo lo que Coni tiene que leer para firmar. La oportunidad más
grande es separar lectura y decisión en dos columnas: el guion a la izquierda, los pasos y la firma a la derecha.

## Lo que funciona

- Los tres pasos numerados en orden estable (voz, guion, avatar) y una sola firma: una decisión por pantalla.
- «Falta: escuchar tu voz · elegir el avatar» dice qué cierra la firma en vez de un botón muerto.
- El panel del guion es plano, en piedra alta, con la fuente al pie: se lee como un ensayo, no como un formulario.

## Problemas priorizados

1. **[P1] La barra de firma tapa el guion.** A 1280 x 900 la hoja fija (Falta, pista, costo, unos 190 px) queda a
   media pantalla sobre el texto del guion. Lo que firma queda oculto justo cuando lo lee (principio 1: lo aprobado
   completo a la vista). **Arreglo:** desde `md`, la firma sale del flujo de la columna de lectura y vive en una
   columna derecha, pegada arriba mientras baja por el guion. **Comando:** `/impeccable layout`.
2. **[P1] El ancho no se usa.** Una columna de 560 px en 1280 px: sobran unos 720 px y todo se apila, así que el guion
   (lo largo) empuja el paso 3 y la firma a más de una pantalla de distancia del paso 1. **Arreglo:** dos columnas;
   izquierda el guion (lo que lee, 42rem para unos 70 caracteres por línea); derecha el ángulo, la voz, el avatar y la
   firma, en ese orden. **Comando:** `/impeccable layout` + `/impeccable adapt`.
3. **[P2] Lo que falta queda lejos de dónde se arregla.** «Falta: escuchar tu voz · elegir el avatar» aparece entre el
   paso 2 y el 3; el paso 1 ya salió de la vista. **Arreglo:** en la columna derecha la línea «Falta:» queda bajo el
   paso 3 y sobre la pista, con los dos pasos que nombra a la vista sin scroll. **Comando:** `/impeccable layout`.
4. **[P2] Patrón de teléfono en computador.** La hoja con sombra hacia arriba y bordes redondeados solo arriba es el
   lenguaje de una hoja inferior móvil; sobre un escritorio parece un modal que no se cierra. **Arreglo:** en la
   columna derecha la firma es un panel en relieve completo (radio `barra` en las cuatro esquinas, sombra `relieve`),
   como la barra de lote en computador. **Comando:** `/impeccable adapt`.
5. **[P3] «Descartar esta pieza» al final de todo.** Correcto que esté lejos de la firma; en dos columnas debe seguir
   lejos (al pie de la columna de lectura), no junto a la pista. **Comando:** `/impeccable layout`.

## Personas

- **Coni (no técnica, 15 min a la semana, ahora en el computador):** lee el guion y la hoja de firma le tapa dos
  párrafos; para escuchar la voz sube, para elegir el avatar baja más allá del guion, y vuelve a la barra. Cuatro
  desplazamientos para una firma.
- **Usuario de teclado:** el orden de foco sigue los pasos (Volver, ángulo, voz, guion, avatar, firma); en dos
  columnas tiene que seguir así, de modo que el número del paso explique el salto entre columnas.

## Observaciones menores

- El selector de ángulo ocupa todo el ancho de la columna de lectura para un texto de 3 palabras.
- La línea «Claude revisó el guion y no encontró observaciones. Tú decides.» queda bien bajo el panel; no moverla.

## Restricciones para el arreglo

- Teléfono (< `md`) idéntico al píxel: las capturas base del proyecto `app` deben seguir pasando.
- Orden estable: mismos pasos, misma numeración; ninguna pieza cambia de lugar según el estado.
- Solo esta pantalla: la puerta 1 del carrusel y la puerta 2 (video) no cambian (quedan como siguientes pasos).
