# Corte Angular 025: factory institucional

## Objetivo

Este corte convierte una fórmula o score institucional ya validado al mismo
`CalculatorDefinition` que consume el renderer Angular de las 57 herramientas.
Permanece aislado hasta que el validador atómico del catálogo pueda garantizar
que todo JSON proveniente de PostgreSQL es seguro y coherente.

## Contrato preservado

- una calculadora nueva usa ID `config-{id}`;
- un reemplazo conserva el ID y la posición de la herramienta canónica, pero
  ejecuta su definición institucional;
- number, select, checkbox, section, text y textarea abren como en el legacy;
- los valores configurados son ejemplos/placeholders y no datos clínicos;
- sólo `scenario` conserva un valor inicial canónico;
- un checkbox configurable nunca se vuelve obligatorio por accidente;
- decimales se limitan a 0–6 y severidades a `good`, `warn`, `bad` o `info`;
- scores muestran sólo las primeras ocho contribuciones no nulas;
- notas permanecen como strings interpolados, sin HTML crudo.

## Resultado configurable

La factory conserva etiqueta, unidad, rango, badge, métricas y texto de versión
del frontend anterior. Fórmulas y scores usan exclusivamente el motor TypeScript
seguro incorporado en el corte 024.

## Evidencia

- **7/7** pruebas de traducción y presentación;
- **31/31** aserciones;
- reemplazos, custom, campos vacíos, placeholders, `scenario`, rango,
  severidad inválida, clamp decimal y ocho contribuciones cubiertos;
- runner TypeScript/Node sin paquetes adicionales y con temporal aislado.

## Pendiente

La factory no acepta directamente el DTO HTTP. El siguiente corte debe validar
atómicamente modo, campos, opciones, reglas, rangos, variables de expresión,
duplicados y límites de tamaño; recién entonces podrá unir catálogo, factory y
workspace con comportamiento fail-closed.
