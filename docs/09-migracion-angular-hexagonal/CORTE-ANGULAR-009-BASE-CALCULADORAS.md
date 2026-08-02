# Corte Angular 009: base segura de calculadoras

## Objetivo

Este corte crea la base verificable para migrar la biblioteca clínica sin
ejecutar la interfaz JavaScript anterior ni publicar una biblioteca parcial.
Todavía no agrega la pestaña Calculadoras al producto Angular.

El inventario canónico contiene **57 herramientas** y conserva su orden e ID:

- 23 del núcleo histórico `app.js`;
- 16 de oncología general;
- 6 de ginecología;
- 8 de digestivo y tórax;
- 4 de radioterapia.

Los IDs y títulos son únicos. Cada elemento registra archivo de origen y estado
`ported` o `pending`, por lo que ninguna calculadora puede desaparecer sin que
la verificación del inventario falle.

## Primer lote portado

La base TypeScript incluye las primeras tres definiciones:

1. superficie corporal por Mosteller;
2. índice de masa corporal;
3. carboplatino por fórmula de Calvert.

Se conservaron los valores iniciales, campos, unidades, límites, incrementos,
desindexación de eGFR, tope opcional de 125 ml/min, redondeos, textos y
advertencias de la implementación vigente. El motor distingue entre un campo
no enviado —usa el valor inicial— y un campo que el usuario vació de forma
explícita.

## Motor Angular

`frontend/src/app/features/tools/calculators/` contiene:

- modelos discriminados para campos, valores, resultados y errores;
- un evaluador puro, independiente del DOM y del renderizado;
- inventario tipado de las 57 herramientas;
- definiciones del primer lote;
- pruebas doradas ejecutables en Node, sin navegador.

El motor no utiliza `eval`, `Function`, `innerHTML`, `outerHTML` ni HTML
procedente de PostgreSQL. La futura interfaz Angular deberá renderizar etiquetas,
opciones, métricas y notas mediante interpolación normal.

## Configuración institucional operativa

`GET /api/clinical/tools/calculators` entrega únicamente:

- calculadoras configuradas activas;
- ajustes institucionales activos;
- ID, clave, nombre, descripción, revisión y definición necesarios para uso
  clínico.

Requiere `section.tools.use` tanto en el interceptor temprano como en el
controlador. No exige `section.configuration.view` y no expone historial,
autores, elementos archivados ni comandos administrativos. Esto evita que un
rol clínico autorizado caiga silenciosamente en fórmulas diferentes de las
configuradas por la institución.

## Evidencia

- 57 IDs, títulos y ordinales únicos con distribución 23/16/6/8/4;
- 13/13 pruebas doradas del inventario, motor, valores normales y límites;
- build Angular de producción correcto;
- 23/23 pruebas Java focales de RBAC, proyección operativa y OpenAPI;
- `git diff --check` sin errores.

## Estado y salida pendiente

Calculadoras continúa `Pendiente` en la matriz de paridad: sólo **3 de 57**
reglas están portadas y todavía no existe interfaz Angular visible. La ruta
legacy `/herramientas/` tampoco se enlaza desde Angular porque conserva riesgos
de permisos y contenido configurable.

La pestaña nativa se habilitará cuando las 57 definiciones, sus casos límite y
la configuración institucional hayan alcanzado paridad. En ese mismo corte se
retirará o bloqueará la ruta legacy para cerrar su acceso directo.
