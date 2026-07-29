# Modelo de datos

PostgreSQL es la única base operacional. Flyway crea el esquema de forma
reproducible al primer inicio.

La definición exacta está en `src/main/resources/db/migration`. El
[diccionario de datos](DICCIONARIO-DE-DATOS.md) explica las 28 tablas y sus
relaciones sin reemplazar esas migraciones.

## Identidad y acceso

- `local_users`
- `local_roles`
- `local_permissions`
- `local_user_roles`
- `local_role_permissions`
- `local_sessions`
- `local_security_settings`

## Paciente e historia

- `patients`: identidad y cobertura;
- `hcop_patient_documents`: hoja clínica JSON versionada;
- `patient_records`: registros normalizados opcionales;
- `local_patient_record_overlays`: cambios locales sobre importaciones.

La hoja JSON conserva la estructura y el orden visual. Los dominios operativos
críticos también se guardan en tablas relacionales.

## Tratamiento y Hospital de Día

- `clinical_treatments`;
- `treatment_details`;
- `treatment_cycle_logistics`;
- `unified_infusion_sessions`;
- `unified_infusion_medications`;
- `treatment_management_states`;
- `treatment_workflow_requests`;
- `clinical_workflow_events`;
- `clinical_qr_scan_events`.

## Configuración

- `clinical_configuration_items`;
- `clinical_configuration_versions`;
- `scheme_duration_estimates`;
- `system_settings`;
- `reference_records`;
- `local_reference_record_overlays`.

## Archivos y auditoría

- `clinical_files`: metadatos y hash; el binario está en el volumen;
- `clinical_files.upload_session_hash` y `deletable_until`: autorización
  temporal para eliminar una carga de la misma sesión;
- `unified_clinical_audit`: antes/después, actor, entidad y motivo.

## Concurrencia

Las tablas mutables incluyen `revision`. Los `UPDATE` escriben solamente si la
revisión esperada coincide.

La protección del turnero está implementada en PostgreSQL mediante
`prevent_infusion_overlap()` y el trigger `trg_prevent_infusion_overlap`.
Serializa reservas del mismo sillón y rechaza cualquier intersección incluso si
dos equipos intentan reservar a la vez.
