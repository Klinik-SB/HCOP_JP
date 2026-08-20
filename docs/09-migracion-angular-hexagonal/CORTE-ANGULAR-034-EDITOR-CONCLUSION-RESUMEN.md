# Corte Angular 034: editor de Conclusión / resumen

Fecha: 2026-08-02
Estado: implementado y validado localmente; no publicado

## Objetivo

Migrar el primer formulario de la hoja clínica a Angular de extremo a extremo,
sin iframe ni ejecución de JavaScript legacy, conservando el contrato vigente
de primera carga, modificación, motivo, historial, auditoría, permisos,
persistencia optimista y conflicto concurrente.

## Recorrido visible

La sección **Conclusión / resumen** mantiene su posición y aspecto en la hoja.
Un usuario con `section.history.edit` ve el lápiz de edición cuando la historia
admite el formulario estructurado. El modal usa los mismos componentes visuales
del producto y contiene:

- `Conclusión / resumen`;
- `Conducta / plan`;
- motivo obligatorio desde la segunda versión;
- contador y límite de 50.000 caracteres por campo;
- carga inicial que exige al menos uno de los dos campos;
- cierre exclusivamente mediante sus botones, sin cierre por fondo o tiempo.

Al abrir, el foco entra en el primer campo; `Tab` y `Shift+Tab` permanecen en el
diálogo. Cancelar o guardar devuelve el foco al lápiz de edición. Ante un
conflicto, el modal se retira y el foco pasa al banner que conserva el borrador.

Las historias importadas que aún usan el editor de texto compatible no se
convierten de forma destructiva: el lápiz permanece oculto hasta migrar ese
contrato en un corte específico.

## Borrador y navegación

Antes del primer `PUT`, un registro global conserva sólo un token opaco, el ID
del paciente, una etiqueta estática y el indicador `dirty`. No copia texto
clínico, no usa `localStorage` y no registra callbacks. Mientras existe un
borrador sucio:

- se advierte al cerrar o recargar la pestaña;
- se bloquea cambiar, crear o cerrar paciente;
- se bloquean Configuración, logout, fallback legacy, cambio de panel,
  impresión y mutaciones de archivos;
- el propio editor sí puede ejecutar `saveState()`;
- cancelar el cierre mantiene el texto;
- un error HTTP o de red mantiene modal y contenido para reintentar.

Ante `VERSION_CONFLICT`, `PatientWorkspaceService` toma una copia profunda del
intento. El modal libera su token y el banner de conflicto pasa a ser el único
propietario visible del borrador, evitando dos bloqueos superpuestos.

## Persistencia y auditoría

El helper puro `clinical-summary-plan-edit.ts` construye el borrador compatible
con el contrato estructurado legacy:

- `narrative.summary` y `narrative.plan` contienen el valor vigente;
- `meta.sectionFormModes.summaryPlan = "structured"`;
- `meta.sectionAudit.summaryPlan` contiene actor, matrícula, acción e instante;
- `meta.sectionVersions.summaryPlan[]` agrega snapshots inmutables;
- una primera carga usa `Carga inicial` y acción `cargado`;
- una modificación exige motivo y usa acción `modificado`;
- vaciar ambos campos agrega `Sin datos cargados.` sin borrar el historial;
- si existía texto local sin historial, se crea primero su retroversión inicial;
- claves clínicas y metadatos desconocidos se preservan.

Ese historial generado por Angular es sólo una previsualización: no es una
fuente de confianza. Java agrega `ClinicalDocumentChangeValidator` y
`ClinicalSummaryPlanAuthority` antes de persistir. Valida `summary` o `plan`
sólo si cambió contra PostgreSQL, exige texto y aplica el límite de 50.000. El
motivo se recibe como solicitud transitoria y luego se elimina. Java descarta
versiones y auditorías entrantes, conserva la cadena confirmada y agrega una
nueva versión con identidad de la sesión, reloj del servidor e ID propio. El
`PUT` devuelve el estado canónico y Angular reemplaza con él su copia optimista.
La identidad del paciente, permisos, protección de Prescripción y CAS por
`meta.persistenceRevision` continúan siendo barreras independientes.

Si `summary` o `plan` contienen una forma legacy no textual, Angular no ofrece
el editor estructurado y Java preserva el valor sin conversión. Esto evita que
editar el otro campo borre silenciosamente contenido histórico.

## Evidencia

- helper: 17 casos y 109 aserciones, incluida la preservación de un campo
  legacy sobredimensionado, el rechazo de formas no textuales y una colisión
  deliberada de snapshots;
- registro de borradores: 18 aserciones sin contenido clínico almacenado;
- errores/transiciones: 7 casos y 32 aserciones;
- validator, autoridad de auditoría y contratos MVC Java: 34 pruebas
  focalizadas aprobadas sobre manipulación de metadatos, motivo, actor, reloj,
  valores legacy, permisos, Swagger y respuesta canónica;
- compilación Angular de producción correcta;
- Docker: construcción completa Java + Angular correcta;
- Chrome + PostgreSQL efímero: 2 recorridos E2E aprobados;
- E2E del editor: foco inicial y contenido, cierre no accidental, retorno del
  foco, carga inicial, error transitorio sin pérdida del texto, descarte
  cancelado, bloqueo de salidas, modificación, dos revisiones, snapshots y
  auditoría recuperados de la base;
- E2E concurrente anterior: `VERSION_CONFLICT`, borrador ganador y limpieza
  completa continúan correctos;
- todos los pacientes, contenedores, redes y volúmenes sintéticos fueron
  eliminados al terminar.

La compilación informa una deuda no bloqueante: el bundle inicial mide
aproximadamente 758,2 kB y supera el presupuesto de advertencia de 750 kB por
unos 8,2 kB. El límite de error de 1,2 MB no se alcanza. Debe reducirse en un
corte de rendimiento, no ocultarse elevando el presupuesto sin análisis.

## Estado de paridad

La fila **Hoja clínica** continúa `Pendiente`: este corte valida un formulario
completo, pero todavía faltan los demás editores de sección, el historial
visible equivalente y la resolución humana por registro. El nuevo patrón es la
base obligatoria para migrarlos uno por uno.

## Próximo corte seguro

Reutilizar este registro de borrador y el mismo contrato de auditoría para
**Motivo de consulta**, incluyendo E2E de permiso denegado y recuperación tras
un error transitorio, sin ampliar todavía el alcance a listas complejas.
