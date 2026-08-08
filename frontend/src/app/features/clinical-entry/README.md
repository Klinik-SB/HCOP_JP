# Entradas clínicas Angular

Este módulo implementa los dos editores nativos de la hoja clínica. No usa el JavaScript histórico, `iframe` ni redirecciones.

## Componentes

- `app-evolution-entry-modal`
  - input `open: boolean`
  - input `initial: EvolutionEntryDraft | null` (opcional, permite reutilizar el editor)
  - output `saved: ClinicalEntrySaveResult`
  - output `closed: void`
- `app-diagnosis-entry-modal`
  - input `open: boolean`
  - output `saved: ClinicalEntrySaveResult<DiagnosisRecord>`
  - output `closed: void`

Ambos modales sólo solicitan cierre mediante la X o `Cancelar`. Un borrador sucio exige confirmación explícita dentro del modal; no existe cierre por backdrop, temporizador ni Escape.

## Selectores estables para integración y pruebas

- Diagnóstico: `[data-entry-field="ajcc"]`, `prefix`, `date`, `axis:T`, `axis:N`, `axis:M`, `stage`, `snomed`, `cie10`.
- El botón de alta de la hoja debe controlar `open`; el output `saved` permite refrescar foco/línea de tiempo y mostrar `warning` si el diagnóstico se guardó pero no pudo vincularse de inmediato a Tratamientos.

## Persistencia y seguridad

`ClinicalEntryService` guarda exclusivamente mediante `PatientWorkspaceService.saveState`, que exige la revisión vigente y conserva el borrador de conflicto. Diagnóstico agrega una entrada inmutable por identidad a `oncology.diagnosisRecords`, proyecta el último diagnóstico a la cabecera y luego lo vincula al selector de Tratamientos con la nueva revisión. Evolución se agrega a `evolutions` con fecha, profesional, especialidad y auditoría de la sesión.
