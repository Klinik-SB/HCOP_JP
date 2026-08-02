# Corte Angular 024: catálogo y motor configurable

## Objetivo

Este corte crea las capas aisladas necesarias para que el renderizador Angular
pueda respetar la configuración institucional sin ejecutar JavaScript legacy:

- cliente de `GET /api/clinical/tools/calculators`;
- normalizador del contrato recibido como `unknown`;
- merge puro de desactivaciones y overrides `builtin`;
- parser aritmético TypeScript seguro;
- motor tipado de fórmulas, scores, reglas y rangos.

Las capas todavía no se conectan al workspace visible. Esta separación permite
comparar su semántica antes de aceptar contenido clínico persistido.

## Catálogo operativo

`CalculatorCatalogService` usa exclusivamente el endpoint operativo protegido
por `section.tools.use`, con credenciales, caché `shareReplay`, reintento,
limpieza de caché tras error e invalidación por evento local o `storage`.

Esto corrige una dependencia del frontend anterior, que consultaba endpoints de
Configuración y por lo tanto necesitaba `section.configuration.view` para una
acción clínica de Herramientas.

El adapter implementa este subconjunto seguro:

- `settings.definition.disabledBuiltInKeys` elimina la herramienta antes de
  considerar overrides;
- la clave estable conserva normalización de tildes, puntuación y límite de 80
  caracteres del legacy;
- un override `builtin` puede cambiar metadatos y textos de campos/opciones;
- ID, tipo, obligatoriedad, límites, orden y función `calculate` permanecen
  exactamente en la definición clínica canónica;
- el merge no muta las 57 definiciones originales.

Fórmulas y scores permanecen inertes en este adapter hasta conectar la
validación atómica y el motor seguro del mismo corte.

## Motor configurable seguro

`safe-expression.engine.ts` porta el lenguaje restringido existente:

- números, exponentes, variables propias y operadores `+ - * / % ^`;
- paréntesis, coma y funciones cerradas `abs`, `sqrt`, `round`, `floor`,
  `ceil`, `min`, `max`, `pow`, `log` y `exp`;
- precedencia y asociatividad heredadas, incluido `-2^2 = 4`;
- rechazo de caracteres, funciones, variables y resultados no finitos.

`configurable-calculator.engine.ts` conserva:

- fórmulas con rangos ordenados y extremos inclusivos;
- scores con base, checkbox, select y primera regla numérica coincidente;
- operadores `lt`, `lte`, `eq`, `gte`, `gt` y `between`;
- contribuciones en orden, incluso cuando valen cero;
- primera coincidencia cuando los rangos se superponen.

No usa `eval`, `Function`, DOM ni HTML crudo.

## Evidencia

- **66.281 aserciones diferenciales** contra
  `configuration/expression-engine.js` y `configuration/calculator-engine.js`;
- corpus de fórmulas, errores, reglas, rangos, scores e intentos de inyección;
- **7/7** pruebas puras del catálogo y merge `builtin`;
- typecheck explícito del servicio Angular;
- runners sin paquetes adicionales y con limpieza de temporales verificada.

## Riesgo pendiente y siguiente corte

PostgreSQL garantiza JSONB pero no el esquema clínico interno. Antes de conectar
el catálogo al workspace se debe rechazar atómicamente cualquier payload con:

- modo, campo u operador desconocido;
- claves u opciones duplicadas;
- números no finitos, rangos inválidos o pasos no positivos;
- expresión vacía, variable ajena a los campos o estructura sobredimensionada;
- override duplicado o dirigido a un built-in inexistente;
- severidad o nota fuera de la allowlist.

Un error, 401 o 403 no debe mostrar silenciosamente las 57 herramientas
estáticas como si fueran la configuración institucional. Tras incorporar esa
validación se conectarán catálogo y motor al renderer, se preservará la
selección cuando siga disponible y se ejecutará la comparación visual/E2E.
