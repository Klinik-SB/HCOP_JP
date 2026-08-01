# Corte Angular 005: Prescripción

## Alcance completado

La solapa **Prescripción** ya está gobernada por Angular y conserva el lenguaje
visual del frontend de referencia. El corte incluye:

- recetas de medicamentos con búsqueda en el catálogo local;
- certificados, solicitudes de estudios e indicaciones de texto libre;
- formularios sistémicos locales, completado asistido y edición sobre la hoja;
- vista previa, impresión, duplicación y eliminación;
- listado de documentos del paciente y aparición cronológica en la hoja clínica;
- obra social y número de afiliado en la receta;
- auditoría del profesional, matrícula y precisión de fecha;
- fecha clínica local y conservación del profesional original al reimprimir;
- modo de solo lectura según permisos;
- conservación de registros históricos de tipos que Angular todavía no conoce.

No se reincorporaron las acciones de importar o exportar, retiradas del producto
por decisión funcional.

## Persistencia y contratos

Los documentos se conservan en `state.prescriptions` dentro del documento
clínico versionado del paciente. Angular lee y guarda ese documento mediante:

- `GET /api/hc`, asociado al paciente activo de la sesión;
- `PUT /api/hc` con control optimista de revisión sobre ese mismo paciente;
- `GET /api/medications/search?q={texto}` para el catálogo local;
- `GET /api/systemic-forms` para los modelos de formularios;
- `POST /api/llm/fill-systemic-form` para el completado opcional.

El servidor exige `section.history.view` para leer la hoja. Para modificar
`prescriptions` exige simultáneamente `section.history.edit` y
`section.prescriptions.edit`. Sin `section.prescriptions.view`, la respuesta
clínica omite esos documentos y la solapa no se muestra. Una posterior edición
de otra parte de la historia conserva los documentos ocultos, por lo que la
segmentación de permisos no puede causar pérdida de datos. La interfaz refleja
los permisos, pero la autorización real permanece en el servidor. La búsqueda
del catálogo de medicamentos también exige `section.prescriptions.view`.

## Archivos principales

- `frontend/src/app/features/prescription/prescription.component.ts`: estado,
  validaciones, persistencia, impresión y formularios sistémicos.
- `frontend/src/app/features/prescription/prescription.component.html`: interfaz
  Angular y diálogos.
- `frontend/src/app/features/prescription/prescription.component.scss`: paridad
  visual y hoja sistémica adaptable.
- `src/main/java/ar/com/hexium/hcop/patient/ClinicalDocumentController.java`:
  autorización condicional de lectura y escritura.
- `src/test/java/ar/com/hexium/hcop/patient/ClinicalDocumentControllerPermissionTest.java`:
  regresión de permisos.
- `src/test/java/ar/com/hexium/hcop/catalog/LegacyCatalogControllerPermissionTest.java`:
  protección del catálogo de medicamentos.

## Validación realizada

- compilación de producción de Angular;
- 149 pruebas Java completas, incluidos permisos, arquitectura y OpenAPI;
- construcción completa de la imagen Docker;
- prueba en PostgreSQL aislado con alta, recuperación y eliminación;
- inspección visual en navegador de receta, vista previa y formulario sistémico;
- comprobación de que el formulario sistémico mantiene ancho de hoja y campos
  editables;
- comprobación de que un formulario sistémico nuevo sólo se imprime después de
  persistir, mientras que un documento ya registrado sólo permite imprimir copia;
- comprobación de consola sin errores.

La base y el paciente utilizados para QA fueron temporales y no pertenecen a la
instancia operativa.
