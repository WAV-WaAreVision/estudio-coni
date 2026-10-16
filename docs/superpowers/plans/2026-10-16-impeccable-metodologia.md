# Metodología Impeccable: menos fricción para Coni y mejor puntaje de critique

Fecha: 16-10-2026. Dueño: Federico. Ejecuta: Claude con agentes, con OK de Federico en cada salida a producción.

## 1. Objetivo y cómo se mide

Conidolly existe para que Coni publique cada semana en menos de 15 minutos, firmando todo en su nombre
(docs/PRODUCT.md). La UI/UX mejora cuando baja su tiempo y sus toques sin bajar el control. Por eso se mide de dos
formas que se revisan juntas: el puntaje de diseño y la fricción real.

### 1.1 Puntaje de diseño (Impeccable `critique`)

| Métrica | Hoy | Meta para migrar | Meta en producción |
|---|---|---|---|
| Nielsen (critique) | 25/40 (mockups v1, 15-10) | ≥ 32/40 en mockups v3 | ≥ 34/40 en la app real |
| Problemas P0 / P1 | 0 / 3 | 0 / 0 | 0 / 0 |
| Fallas de carga cognitiva (checklist de 8) | 4 | ≤ 1 | ≤ 1 |
| Hallazgos reales del detector | 1 bug de CSS | 0 | 0 |
| `audit` (a11y, rendimiento, responsive) | sin medir | sin críticos | sin críticos ni altos |

Cada corrida de `critique` queda en `.impeccable/critique/` con su puntaje; la tendencia por pantalla es el
indicador de avance. Los falsos positivos aceptados van a `.impeccable/critique/ignore.md` con su razón.

### 1.2 Fricción real (datos de producción)

Sale de `public.eventos` (cada cambio de una pieza con actor y hora) y de `public.piezas`, sin instrumentación nueva:

| Métrica | Cómo se calcula | Meta |
|---|---|---|
| Visitas de firma por pieza | entradas de Coni que cambian estado, por pieza publicada | 2 (puerta 1 y puerta 2) |
| Minutos de Coni por semana | suma de sesiones: primer y último evento de Coni por día con brecha < 10 min | < 15 |
| Tiempo a firmar | de `guion_por_aprobar` a `en_render`, y de `video_por_aprobar` a `programado` | mediana < 24 h |
| Retrabajo | piezas con `pedir_cambios`, regrabar o deshacer / piezas publicadas | < 30 % |
| Fallas que ve Coni | piezas con `explicacion` no nula por semana | tendencia a 0 |
| Abandono | piezas descartadas sin publicar / piezas elegidas | < 20 % |

Una consulta SQL guardada (`docs/metricas-friccion.sql`, se escribe en la fase 0) produce esta tabla cada lunes.
Hasta tener 8 semanas, cada número va con su tamaño de muestra (principio 3 de PRODUCT.md).

## 2. El ciclo de trabajo (se repite por pantalla)

```
critique  ->  decidir (Federico)  ->  comando específico  ->  revisar capturas  ->  critique otra vez
   ^                                                                                      |
   +------------------------------- hasta cumplir la meta --------------------------------+
```

1. **Medir.** `critique` sobre la pantalla (mockup o ruta real). Dos evaluaciones aisladas: revisión de diseño y
   detector automático con overlay en el navegador.
2. **Decidir.** Federico elige prioridad y alcance con las preguntas que trae el informe. Nada se arregla sin esa
   elección.
3. **Arreglar con el comando que corresponde** (tabla de la sección 4). Un comando por problema, no "arreglar todo".
4. **Ver.** Capturas 390 × 844 (primera vista y completa) y, en escritorio, 1280 px para la vista de WAV.
5. **Volver a medir.** `critique` de nuevo; el puntaje debe subir o el cambio se revierte.

Reglas del ciclo:
- Mockups primero (barato), código después (caro). En código: TDD, rama propia, revisión por lote, y producción
  solo con OK.
- La regla madre aplica: el primer resultado de cada comando es hipótesis; se revisa contra PRODUCT.md, DESIGN.md
  y los datos antes de mostrarlo.
- No se mezcla rediseño visual con cambios de flujo en la misma rama.
- `colorize` y `overdrive` quedan fuera: contradicen el monocromo gris neutro y la calma que pide PRODUCT.md.

## 3. Fases

### Fase 0: línea base (1 sesión)

| Paso | Comando o acción | Salida |
|---|---|---|
| 0.1 | `critique` sobre los mockups v3 (7 pantallas) | puntaje v3 vs 25/40 |
| 0.2 | `critique` sobre la app real en producción, rutas: `/`, `/guion/[id]`, `/video/[id]`, `/ajustes/cuentas`, `/ideas`, `/calendario` | puntaje de lo que Coni usa hoy |
| 0.3 | `audit` sobre la app real | lista técnica de a11y y rendimiento |
| 0.4 | Escribir `docs/metricas-friccion.sql` y correrla | fricción de la primera semana del flujo nuevo |
| 0.5 | Federico prioriza | orden de las fases 1 y 2 |

### Fase 1: mockups v3 hasta la meta (2 a 3 sesiones)

Orden por impacto en la fricción de Coni:

| Pantalla | Comandos | Qué se busca |
|---|---|---|
| Puerta 1 (guion + voz) | `harden`, `clarify`, `distill` | toda falla con salida (voz, saldo, tope, frase marcada); una sola decisión visible; texto de la barra corto |
| Puerta 2 (revisión) | `layout`, `clarify` | texto de LinkedIn y fecha alcanzables sin scroll largo; qué se firma y hasta cuándo se cancela |
| Inicio | `distill`, `layout` | la firma primero; ≤ 4 opciones por decisión; ideas y calendario como profundidad opcional |
| Aviso con Deshacer y estados de trabajo | `harden`, `animate` | anuncio a lector de pantalla, foco, sin rebotes; movimiento solo para cambiar estado |
| Cuentas y Ajustes | `clarify`, `adapt` | saldos en lenguaje simple; vista densa de WAV en escritorio |
| Estados vacíos y primer uso | `onboard` | semana sin piezas, LinkedIn sin conectar, banco de ideas vacío |
| Todo | `typeset`, luego `polish` | jerarquía 15/18/20/24/32 consistente; detalles finales |

Salida de la fase: `critique` ≥ 32/40, 0 P0/P1, carga cognitiva ≤ 1 falla, aprobación de Federico.

### Fase 2: migración a la app (spec + plan + lotes)

1. `extract` sobre los mockups aprobados: tokens y componentes que van a `app/globals.css` y `components/ui`.
2. Spec (superpowers:brainstorming) y plan (superpowers:writing-plans) de la migración visual, sin tocar flujos.
3. Implementación por lotes con agentes, revisión por lote, E2E y capturas visuales actualizadas.
4. `critique` y `audit` sobre la app en local antes del merge; meta ≥ 34/40.
5. Deploy con OK (solo Vercel si no hay cambios de base ni de tareas).

### Fase 3: medir en producción y ajustar (semanal, 8 semanas)

- Cada lunes: `docs/metricas-friccion.sql` y una línea en `docs/TRASPASO.md` con los números y su muestra.
- Si una métrica empeora dos semanas seguidas: `critique` de la pantalla responsable y un ciclo corto.
- `live` para decisiones finas en el navegador (un botón, un texto, un espaciado) en vez de rehacer mockups.
- A las 8 semanas: revisión con Coni (15 min) sobre lo que le costó; se contrasta con los datos.

## 4. Qué comando para qué síntoma

| Síntoma | Comando |
|---|---|
| Coni no sabe qué hacer después, o hay errores sin salida | `harden` |
| Textos largos, ambiguos o técnicos ("API", caracteres) | `clarify` |
| Demasiadas opciones o bloques en una pantalla | `distill` |
| Lo importante no es lo primero que se ve | `layout` |
| Se ve plano o sin jerarquía | `typeset` (y `bolder` solo si sigue plano) |
| Se ve recargado | `quieter` |
| Primera vez o pantalla vacía | `onboard` |
| Escritorio o letra grande se rompen | `adapt` |
| Lenta al abrir o al firmar | `optimize` |
| Antes de cada merge | `polish` y `audit` |
| Duda entre dos variantes concretas | `live` |

## 5. Calendario sugerido

| Semana | Trabajo |
|---|---|
| 16 al 18 de octubre | Fase 0 completa |
| 19 al 25 de octubre | Fase 1 (puertas 1 y 2, Inicio) |
| 26 de octubre al 1 de noviembre | Fase 1 (resto) + spec y plan de migración |
| 2 al 15 de noviembre | Fase 2 por lotes y deploy |
| Desde el 16 de noviembre | Fase 3, semanal |

Los pilares de LinkedIn (cambio de datos, no de UI) van en su propia rama en paralelo; sus colores y nombres se
reflejan en los mockups cuando estén definidos.

## 6. Riesgos

- **Puntaje sin uso real:** un 34/40 en mockups no garantiza menos minutos. Por eso la fase 3 manda sobre la 1.
- **Soft UI y contraste con luz de día:** el relieve se pierde al sol; se valida con `audit` y con el iPhone de Coni,
  no solo en pantalla de escritorio.
- **Muestra chica:** con pocas piezas por semana, una semana mala no es tendencia; se mira de a 2 o más.
- **Cambiar flujo y diseño a la vez:** prohibido en la misma rama (se pierde qué causó qué).
