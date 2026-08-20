# Corte Angular 023: renderizador visible de calculadoras

## Objetivo

Este corte conecta las 57 definiciones clínicas portadas con Herramientas
mediante Angular real. Reemplaza, dentro de la superficie Angular, la necesidad
del iframe de `/herramientas/index.html?embedded=1`, pero conserva el frontend
anterior como referencia y rollback hasta cerrar toda la matriz de paridad.

## Comportamiento incorporado

- tercera subsolapa `Calculadoras`, visible únicamente con
  `section.tools.use`;
- regreso automático a Guías si el permiso se revoca mientras la subsolapa
  está abierta;
- selección por patología/grupo y calculadora, con el mismo orden y valor
  inicial del modo embedded anterior;
- formulario inicialmente vacío, ejemplos sólo como placeholder y cálculo
  únicamente al enviar `Calcular`;
- campos number, select, text, textarea, checkbox y section;
- campos condicionales por escenario, validación tipada y errores asociados a
  su control mediante ARIA;
- resultado con severidad, score opcional, métricas, notas, checklist, enlaces
  HTTPS y tablas tipadas;
- variante visual de radioterapia y tablas con desplazamiento horizontal;
- un único desplazamiento vertical dentro del workspace de calculadoras.

No se usa `iframe`, `innerHTML`, `eval`, `Function` ni se ejecutan archivos
JavaScript del frontend anterior.

## Paridad visual preservada

El componente porta de forma encapsulada el contrato embedded de Lira:

- fondo `#f3f3f4`, paneles blancos y borde `#e7eaec`;
- tipografía Open Sans/Helvetica, acento celeste `#0e9aef` y radio de 3 px;
- controles de categoría y calculadora, cabecera, Uso clínico, Variables y
  Resultado en el mismo orden;
- dos columnas de variables y resultado lateral en ancho suficiente;
- una columna por debajo de 980 px y formularios compactos por debajo de
  620 px;
- acento terracota `#d05d4a` para Radioterapia.

No se agregó el buscador/sidebar de la vista autónoma porque el modo embedded
anterior tampoco los mostraba. Los botones de ayuda locales permanecen fuera,
en línea con la decisión vigente de conservar la ayuda global sin repetirla en
cada subsolapa.

## Rendimiento

`@defer` mantiene las reglas fuera del bundle inicial hasta abrir Calculadoras.
El build de producción validado produjo:

- bundle inicial: **702,57 kB**;
- chunk diferido `calculator-workspace-component`: **226,66 kB**;
- presupuesto de error de 1,2 MB: respetado sin desactivarlo.

## Evidencia

- **241/241** pruebas doradas de las 57 definiciones y el motor;
- build Angular de producción correcto;
- `git diff --check` correcto;
- revisión estática sin iframe ni renderizado de HTML crudo;
- permiso `section.tools.use` aplicado tanto al tab como al panel;
- cambio de categoría, selector vacío declarado y acento de Radioterapia
  comparados contra el flujo fuente.

## Pendiente antes de validar la capacidad

La fila Calculadoras continúa `Pendiente`. El siguiente corte debe consumir
`GET /api/clinical/tools/calculators` y aplicar de manera segura:

1. `settings.definition.disabledBuiltInKeys`;
2. overrides por `replacesBuiltInKey` sin alterar la regla clínica original;
3. fórmulas y scores configurables mediante un parser TypeScript seguro, sin
   ejecutar expresiones como código;
4. invalidación del catálogo al cambiar Configuración;
5. errores 401/403 y reintento sin mostrar un catálogo institucional falso.

Después faltan pruebas de componente, comparación visual automatizada contra
el embedded anterior, E2E con permisos y configuración, y smoke integrado en
Docker. Hasta entonces no se retira `/herramientas/` ni se declara paridad
completa.
