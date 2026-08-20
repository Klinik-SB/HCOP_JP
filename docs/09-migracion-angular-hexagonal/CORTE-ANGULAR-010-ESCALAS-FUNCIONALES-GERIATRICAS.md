# Corte Angular 010: escalas funcionales y geriátricas

## Objetivo

Este corte amplía el motor Angular de calculadoras sin publicar todavía una
biblioteca parcial. Migra cuatro herramientas completas del núcleo histórico:

1. ECOG / Karnofsky;
2. Charlson comorbidity index;
3. G8 / CARG;
4. IPSS / SHIM.

La biblioteca alcanza **7 de 57** definiciones portadas.

## Paridad del formulario

La revisión del renderizador anterior confirmó una diferencia importante entre
la definición y la pantalla: los valores declarados en números y selectores eran
ejemplos visuales, no datos precargados. Angular conserva esa conducta:

- los campos obligatorios se abren vacíos;
- los números mantienen el ejemplo como placeholder;
- los selectores exigen una elección explícita;
- los checkbox se abren desmarcados;
- nunca se calcula con datos ficticios al abrir la herramienta.

El modelo incorpora encabezados internos de sección y validación condicional de
campos. En IPSS / SHIM, marcar que no hubo actividad sexual suficiente elimina
la exigencia de las cinco respuestas SHIM, pero conserva sus controles visibles
y no omite IPSS ni calidad de vida.

## Reglas comparadas

- ECOG 0–5 y Karnofsky 0–100 conservan opciones y descripciones exactas.
- Charlson conserva los cortes de edad y las exclusiones entre hepatopatía,
  diabetes y tumor sólido para evitar doble conteo.
- G8 conserva el corte alterado inclusivo `<= 14` y el medio punto de salud
  autopercibida.
- CARG conserva los cortes bajo `0–5`, intermedio `6–9` y alto `>= 10`, con las
  tasas originales de toxicidad G3–5.
- IPSS conserva los cortes 0, 7, 8, 19, 20 y 35.
- SHIM conserva los cortes 22, 17, 12 y 8, además del estado no evaluable.

## Estructura

`frontend/src/app/features/tools/calculators/` agrega:

- definiciones tipadas del lote 04–07;
- registro único de calculadoras ya portadas;
- campos de sección y reglas de validación condicional;
- conversión numérica segura para opciones de select;
- regresiones doradas de resultados normales, extremos e inválidos.

El código continúa sin `eval`, `Function`, `innerHTML`, `outerHTML` ni acceso
directo al DOM.

## Evidencia

- 27/27 pruebas doradas del inventario, motor y siete calculadoras;
- compilación Angular de producción correcta;
- auditoría estática sin ejecución dinámica ni APIs DOM inseguras;
- `git diff --check` sin errores.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 50 reglas, el
renderizador Angular visible, la aplicación de configuración institucional y la
comparación visual/E2E antes de bloquear definitivamente la ruta anterior.
