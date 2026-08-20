# Corte Angular 027: catálogo institucional integrado

## Objetivo

Conectar la biblioteca Angular de calculadoras con la configuración vigente en
PostgreSQL sin introducir un segundo origen de verdad. El workspace sólo se
habilita después de recibir, validar y ensamblar el catálogo completo de
`GET /api/clinical/tools/calculators`.

## Flujo autoritativo

1. `CalculatorCatalogService` solicita el endpoint como `unknown`.
2. `validateInstitutionalCalculatorCatalog` valida atómicamente toda la
   respuesta.
3. `assembleInstitutionalCalculatorCatalog` combina las 57 definiciones base,
   desactivaciones, overrides y calculadoras configurables.
4. El workspace publica la biblioteca únicamente si las tres etapas terminan
   correctamente.

No existe fallback silencioso a las definiciones locales. Un error HTTP, falta
de permiso, contrato inválido o fallo de ensamblado deja el workspace cerrado y
muestra un estado operativo explícito.

El caché queda ligado a la identidad, autenticación, roles y permisos de la
sesión. Un login, logout o cambio de usuario lo invalida antes de que pueda
reutilizarse. La recarga automática escucha una señal específica de
calculadoras; una modificación de guías, agenda o formularios ya no elimina los
valores clínicos que el usuario está completando.

## Ensamblado

El ensamblador puro:

- conserva el orden de las 57 calculadoras base;
- retira las claves desactivadas por configuración;
- mantiene la posición y el ID visual de un override;
- protege la función clínica original de los overrides `builtin`;
- materializa fórmulas y scores mediante la factory segura;
- agrega calculadoras nuevas al final respetando el orden institucional;
- rechaza IDs, claves u overrides duplicados y referencias inexistentes.

La validación también rechaza claves de desactivación que no pertenezcan a las
57 herramientas, literales numéricos no finitos y funciones con aridad
incompatible con el motor. Si una ejecución aun así arroja una excepción, el
workspace la convierte en una advertencia clínica segura y no expone el detalle
técnico.

## Comportamiento del workspace

- muestra estados diferenciados de carga, error con reintento, permiso
  restringido, catálogo institucional vacío y grupo filtrado vacío;
- distingue sesión vencida (`401`) y permiso denegado (`403`) sin ofrecer un
  reintento circular; sólo red, errores de servidor o contrato permiten
  reintentar;
- expone únicamente los selectores de grupo y calculadora, sin buscador ni
  barra lateral paralela;
- oculta inmediatamente la biblioteca durante una invalidación o recarga;
- cancela solicitudes anteriores y descarta respuestas fuera de secuencia;
- conserva sólo el ID seleccionado si continúa activo;
- reinicializa variables y resultado al aplicar una nueva revisión;
- mantiene el renderer Angular nativo y su chunk diferido, sin iframe.

## Evidencia

- **241/241** pruebas doradas de las 57 calculadoras;
- **66.281** aserciones diferenciales del parser y motor configurable;
- **22/22** pruebas del validador atómico;
- **7 pruebas y 31 aserciones** de la factory institucional;
- **7 pruebas y 86 aserciones** del ensamblador;
- **7/7** pruebas puras del catálogo y **6 pruebas con 35 aserciones** del
  servicio fail-closed, sesión y eventos específicos;
- **6 pruebas con 20 aserciones** de presentación de errores y ejecución segura
  del workspace;
- typecheck Angular correcto;
- build productivo correcto;
- chunk `calculator-workspace-component` separado: **261,29 kB** sin comprimir.

## Estado de migración

La integración funcional de Calculadoras queda en **En convivencia**. Para
marcarla `Validada` todavía se requiere ejecutar el recorrido visual/E2E con
usuario autorizado y sin permiso, comparar las resoluciones admitidas y
completar el smoke de la imagen Docker aislada.
