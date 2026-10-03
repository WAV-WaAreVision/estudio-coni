# Calibración de C1: afirmaciones y temas

Se llena después de correr `scripts/evaluar-afirmaciones.ts` con Federico (Task 10, paso 3). Sin números todavía.

Ojo con el gasto: el script de calibración llama a Claude y a Voyage directo, sin pasar por `gastos`. El tope mensual no lo ve, así que su costo se suma al gasto del mes sin que el tope lo cuente.

## Corrida

- Fecha:
- Materiales (ids y autores):
- Tramos por material (`--tramos`):
- Gasto estimado / gasto real (Claude, Voyage):

## Extracción

- Afirmaciones propuestas / con cita literal:
- Supervivencia de la cita literal:
- Afirmaciones por tramo:
- Conteo por tipo:
- Conteo por evidencia:
- Revisión a mano de las 20 afirmaciones al azar (qué sobra, qué falta, citas dudosas):

## Agrupación

| Umbral | Grupos | De una sola afirmación | Grupo mayor | Grupos de 3 o más |
|---|---|---|---|---|
| 0.75 | | | | |
| 0.80 | | | | |
| 0.85 | | | | |

- Revisión de los grupos de 3 o más (coherentes, mezclados, partidos de más):

## Decisiones

- `UMBRAL_TEMA` (hoy 0.78):
- `UMBRAL_GRUPO` (hoy 0.80):
- `UMBRAL_FUSION` (hoy 0.88):
- Cambios a la guía de extracción o a los límites:
