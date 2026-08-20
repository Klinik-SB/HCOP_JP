# Corte Angular 039: Estudios complementarios coordinados

Fecha: 2026-08-03
Estado: implementado y validado localmente; no publicado

## Objetivo

Coordinar **Estudios complementarios** entre la hoja clínica y la solapa
Estudios sin crear un segundo cargador ni duplicar registros. Ambos accesos
usan una única proyección Angular, respetan el orden propio de cada contexto y
mantienen a Java como barrera final de permisos sobre el documento clínico.

Este corte no declara completa la capacidad Estudios. Cierra únicamente la
coordinación entre la hoja y el panel, con navegación, impresión y RBAC
verificados.

## Fuente única y reglas de proyección

`frontend/src/app/core/clinical/clinical-study-projection.ts` reúne los
registros de `state.studies` y `state.externalStudies` sin modificar el estado
recibido. La proyección:

- elimina registros marcados con `deleted`;
- evita que un registro externo reaparezca cuando existe un tombstone local
  con el mismo identificador;
- muestra una sola entrada por identificador;
- prioriza la versión local cuando un repositorio externo entrega el mismo
  identificador;
- conserva por separado registros sin identificador y les asigna una clave
  estable compartida por hoja y panel para seleccionar la tarjeta correcta;
- ordena de manera determinista por fecha y título.

La hoja clínica solicita orden **ascendente**, para conservar la lectura
cronológica del papel. La solapa Estudios utiliza orden **descendente**, para
presentar primero el material más reciente. La proyección de impresión también
consulta esta misma fuente y reconoce estudios locales o externos activos.

## Recorrido coordinado

La sección Estudios complementarios de la hoja tiene dos comportamientos:

1. Si está vacía y el usuario posee `section.studies.edit`, **Subir estudios**
   selecciona la solapa Estudios y abre su modal de carga existente. No se
   incorpora otro formulario ni otra ruta de persistencia.
2. Si contiene registros, hacer clic, pulsar `Enter` o pulsar `Espacio` sobre
   una entrada selecciona la solapa Estudios, activa la tarjeta correspondiente,
   la desplaza a la zona visible y le devuelve el foco. Las tarjetas se exponen
   como controles accesibles con `role="button"` y `aria-pressed`.

El modal no se cierra al pulsar fuera ni con Escape, contiene el foco y lo
devuelve al disparador al cerrarse. Cuando todos los archivos terminan de subir
y el estado clínico se guarda correctamente, el modal se cierra automáticamente.
Un borrador clínico o un conflicto pendiente bloquea la apertura para evitar
cambios de contexto incompatibles.

## Permisos en interfaz y servidor

La interfaz aplica los permisos específicos:

- `section.studies.view` controla la presencia de la sección en la hoja, la
  solapa Estudios y la navegación hacia sus tarjetas;
- `section.studies.edit` habilita el botón de carga y el modal de alta.

La protección no depende sólo del navegador. En
`src/main/java/ar/com/hexium/hcop/patient/ClinicalDocumentAccessPolicy.java`,
Java oculta `studies` y `externalStudies` cuando falta
`section.studies.view`. Al guardar sin `section.studies.edit`, conserva las
colecciones almacenadas si no fueron modificadas y responde `403` ante cambios
o inyecciones en cualquiera de ellas. Con lectura y edición permite actualizar
ambas colecciones.

## Archivos del corte

- `frontend/src/app/core/clinical/clinical-study-projection.ts`;
- `frontend/src/app/core/clinical/clinical-study-projection.tests.ts`;
- `frontend/src/app/core/clinical/clinical-print-projection.ts`;
- `frontend/src/app/core/clinical/clinical-print-projection.tests.ts`;
- `frontend/src/app/features/clinical-workspace/clinical-workspace.component.ts`;
- `frontend/src/app/features/clinical-workspace/clinical-workspace.component.html`;
- `frontend/src/app/features/clinical-workspace/clinical-workspace.component.scss`;
- `frontend/src/app/features/studies/study-panel.component.ts`;
- `frontend/src/app/features/studies/study-panel.component.html`;
- `frontend/src/app/layout/clinical-shell.component.ts`;
- `frontend/src/app/layout/clinical-shell.component.html`;
- `src/main/java/ar/com/hexium/hcop/patient/ClinicalDocumentAccessPolicy.java`;
- `src/test/java/ar/com/hexium/hcop/patient/ClinicalDocumentAccessPolicyTest.java`;
- `frontend/e2e/clinical-conflict.spec.ts`.

## Evidencia automática

- proyección pura de Estudios: **9/9 casos aprobados**;
- proyección de impresión: **7 casos y 30 aserciones aprobadas**;
- validación focal de backend y permisos: **19/19 pruebas aprobadas**;
- recorrido integrado Docker/Playwright: **7/7 escenarios aprobados**.

El escenario de Estudios crea un paciente efímero, abre el modal desde la hoja,
comprueba su foco y cierre explícito, carga un archivo real y verifica el cierre
automático exitoso del modal. Luego elimina ese archivo con la autorización de
la misma sesión. También combina fuentes local y externa, evita duplicados y
registros eliminados, verifica el orden ascendente de la hoja y el descendente
del panel, y confirma que seleccionar una fila —incluido un registro sin ID—
abre y enfoca una única tarjeta con estado accesible. El arnés elimina al
finalizar los datos y recursos sintéticos.

## Estado de paridad

La coordinación **hoja clínica → solapa Estudios**, la proyección compartida,
la impresión y el control `studies.view` / `studies.edit` están validados. La
fila general **Estudios** permanece `Pendiente`; todavía faltan:

1. consistencia transaccional entre el binario y el estado clínico;
2. conciliación y limpieza controlada de archivos huérfanos;
3. una matriz única de formatos admitidos entre interfaz y backend;
4. pegado contextual cuando la solapa Estudios está activa;
5. paridad del visor, plantillas anatómicas, anotación y reordenamiento.

La fila general **Hoja clínica** también continúa `Pendiente` hasta ofrecer el
historial visual equivalente por sección. El progreso global estimado de la
migración queda en **aproximadamente 96,5 %**. Es una estimación conservadora
del trabajo funcional, no una certificación final de liberación.

## Próximo corte seguro

Resolver primero la consistencia entre archivo y estado clínico, con
compensación verificable y conciliación de huérfanos. Luego unificar la matriz
de formatos antes de avanzar sobre pegado contextual, visor, plantillas,
anotación y orden manual.
