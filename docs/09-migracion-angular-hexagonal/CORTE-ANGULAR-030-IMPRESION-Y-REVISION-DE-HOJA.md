# Corte Angular 030 · impresión y revisión de la hoja clínica

Este corte cierra dos riesgos de lectura de la hoja Angular sin habilitar aún
la edición general del documento: una impresión que incluía relleno vacío y un
desajuste entre la revisión enviada por Java y la revisión que Angular usaba al
confirmar un guardado.

## Proyección de impresión

El botón Imprimir sólo está disponible con paciente activo, carga finalizada y
permiso `section.history.view`. Antes de abrir el diálogo del navegador,
Angular fija la fecha y hora de impresión; al terminar, restaura la vista
normal.

La hoja impresa:

- muestra identidad ampliada disponible: HC, DNI, nacimiento, sexo, cobertura,
  afiliado, teléfono, correo y domicilio;
- omite datos personales ausentes en lugar de inventar guiones;
- excluye secciones sin contenido clínico real;
- reutiliza la proyección unificada del corte 029 para sistémicos,
  radioterapia y cirugías;
- conserva la geometría A4 y el ocultamiento del panel derecho mediante el
  contrato CSS compartido.

La vista normal no pierde sus mensajes “Sin …”; la omisión sólo se aplica bajo
`@media print`.

## Contrato de revisión

`PatientWorkspaceController` expone ahora `revision` y `updatedAt` en el nivel
superior del workspace, además del envelope documental anterior. Angular
normaliza en este orden:

1. `workspace.revision`;
2. `workspace.document.revision`, compatible con respuestas anteriores;
3. `state.meta.persistenceRevision`, como último fallback documental.

Antes de cada `PUT /api/hc`, Angular clona el borrador e impone la revisión del
workspace activo. Así el formulario llamante no puede omitir accidentalmente
el control optimista. Una respuesta sólo actualiza la ficha si paciente y
revisión siguen siendo los mismos que al iniciar la operación.

Este cambio no implementa todavía resolución de conflictos. Un `409` no se
reintenta ni se mezcla automáticamente, porque el endpoint reemplaza el
documento completo y un merge ingenuo podría borrar cambios ajenos.

## Evidencia

- 31 casos y 82 aserciones en las suites clínicas Angular: tratamientos,
  proyección de impresión y normalización del workspace;
- compilación Angular de producción satisfactoria;
- prueba Java `PatientWorkspaceControllerPermissionTest`: 1 caso, 0 fallos;
- construcción Docker con las suites Angular como barrera y contenedor QA
  saludable;
- documentación y OpenAPI verificadas contra la instancia aislada.

## Pendiente deliberado

La fila Hoja clínica continúa `Pendiente`: faltan formularios Angular de
edición, borrador recuperable, códigos inequívocos para cada `409`, resolución
explícita de conflicto, comparación visual completa de impresión y auditoría de
cambios. Angular continúa en `/app/` y la raíz `/` conserva la interfaz vigente.
