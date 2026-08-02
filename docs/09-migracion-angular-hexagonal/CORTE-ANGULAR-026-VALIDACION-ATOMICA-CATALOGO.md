# Corte Angular 026: validación atómica del catálogo

## Objetivo

PostgreSQL garantiza que una definición sea JSONB, pero no valida su estructura
clínica. Este corte trata todo el payload de
`GET /api/clinical/tools/calculators` como `unknown` y sólo devuelve un catálogo
tipado cuando la respuesta completa es coherente. Un error invalida el catálogo
entero; nunca se aplica parcialmente.

## Reglas de aceptación

El validador exige:

- `ok=true`, lista de calculadoras y `total` exacto;
- IDs, keys, nombres y revisiones válidos y únicos;
- modos `builtin`, `formula` o `score`;
- campos number, select, checkbox, text, textarea o section con keys ASCII
  únicas;
- números finitos, `min <= max`, `step > 0` y decimales enteros entre 0 y 6;
- opciones únicas según su representación textual;
- operadores `lt`, `lte`, `eq`, `gte`, `gt` o `between`;
- rangos coherentes y severidades `info`, `good`, `warn` o `bad`;
- fórmulas no vacías, sintaxis cerrada y variables declaradas;
- override dirigido a una de las 57 herramientas reales y sin duplicados;
- un override builtin limitado a campos existentes en su regla original.

La instalación sin configuraciones es válida y sintetiza settings vacíos
seguros. Las claves deshabilitadas desconocidas se conservan como no operativas;
no se inventa una herramienta sustituta.

## Límites de seguridad

- expresión: 4.096 caracteres;
- profundidad de expresión: 128;
- campos por definición: 100;
- opciones por campo: 200;
- reglas por campo: 200;
- rangos por definición: 200.

El parser sólo reconoce el lenguaje aritmético y la allowlist de funciones del
motor seguro. No evalúa JavaScript, propiedades, índices ni llamadas externas.

## Frontera con la factory

`toInstitutionalCalculatorFactoryItem` acepta sólo fórmulas y scores ya
validados. Omite `min`, `max` y `step` cuando el normalizado contiene `null`,
conserva los límites existentes y devuelve `null` para `builtin`, cuyo motor
original debe permanecer protegido.

La prueba integrada confirma además que un checkbox puede venir marcado como
requerido en la definición persistida, pero la factory lo neutraliza para
preservar el comportamiento del formulario anterior.

## Evidencia

- **19/19** pruebas del catálogo institucional;
- las **57/57** claves canónicas se calculan y verifican sin colisiones;
- payload, total, IDs, keys, settings, límites, duplicados, override, fórmula,
  función, variable, profundidad, números, opciones, reglas y rangos cubiertos;
- compilación TypeScript del validador, mapper y factory en el mismo runner;
- temporales creados fuera del repositorio y eliminados al finalizar.

## Pendiente

El validador permanece aislado del renderer. El siguiente corte debe cargar el
endpoint al abrir Calculadoras, validar antes de publicar estado, combinar
builtins/overrides/custom, fallar cerrado ante 401/403/red/contrato y preservar
la selección sólo cuando el ID continúe activo. Después corresponde la
comparación visual/E2E y el smoke Docker.
