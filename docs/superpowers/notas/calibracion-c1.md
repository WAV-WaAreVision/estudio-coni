# Calibración de C1: afirmaciones y temas

El primer diseño medía cada afirmación contra el centroide normalizado de un tema, con umbrales 0.78 / 0.80 / 0.88. Con datos reales eso formó temas de 90 a 100 afirmaciones sin relación. Esta nota registra la medición y la decisión que lo corrige.

Ojo con el gasto: el script de calibración (`scripts/evaluar-afirmaciones.ts`) llama a Claude y a Voyage directo, sin pasar por `gastos`. El tope mensual no lo ve, así que su costo se suma al gasto del mes sin que el tope lo cuente.

## Medición sobre datos de producción

- Datos: 385 afirmaciones, embeddings Voyage `voyage-3.5`, texto de psicología en español.
- Coseno entre pares al azar: p50 0.66, p90 0.74, p99 0.81.
- Coseno al vecino más cercano de cada afirmación: p50 0.84.

### Revisión a mano por bandas de coseno

| Coseno entre dos afirmaciones | Qué son |
|---|---|
| 0.74 a 0.76 | Sin relación |
| 0.78 a 0.80 | Misma área amplia, tema distinto |
| 0.82 a 0.84 | Mismo tema |

## Por qué falla el centroide normalizado

Entre afirmaciones al azar el coseno ya es 0.66. El centroide normalizado de un grupo grande y al azar queda a ~0.81 de cada miembro (la dirección media de muchos vectores que comparten un fondo común), aunque los miembros estén a 0.66 entre sí. Con un umbral de 0.78 o 0.80, un grupo grande atrae a cualquier afirmación: cuanto más crece, más atrae. De ahí los temas de 90 a 100 afirmaciones sin relación.

## Decisión

- Enlace promedio (average linkage): la similitud entre una afirmación y un tema es el coseno medio con sus miembros. Con vectores unitarios, `mean(v · m_i) = v · mean(m_i)`.
- `temas.centroide` guarda la media simple SIN normalizar de los vectores de sus afirmaciones no excluidas. Actualización incremental: `m_nuevo = (m*n + v)/(n+1)`.
- `tema_mas_cercano`: candidatos por coseno (índice HNSW, los 10 temas activos más cercanos), puntaje por producto interno `v · centroide`.
- Agrupación (`agruparPorSimilitud`): líder con enlace promedio, suma y conteo por grupo.
- Fusión (`temas_parecidos`): similitud cruzada promedio, `m_A · m_B`.
- Umbral 0.80 para los tres (`UMBRAL_TEMA`, `UMBRAL_GRUPO`, `UMBRAL_FUSION`): es el borde entre "misma área, tema distinto" (0.78 a 0.80) y "mismo tema" (0.82 a 0.84). Como el puntaje es un promedio sobre todos los miembros, un par suelto de 0.81 (p99 al azar) no alcanza para unir nada.

## Pendiente de la calibración con Claude

Se llena después de correr `scripts/evaluar-afirmaciones.ts` con Federico (Task 10, paso 3): extracción (citas literales, afirmaciones por tramo, conteos por tipo y evidencia, revisión de 20 afirmaciones al azar) y la tabla de agrupación con el nuevo método (grupos, de una sola afirmación, grupo mayor, grupos de 3 o más) a 0.78, 0.80 y 0.82.
