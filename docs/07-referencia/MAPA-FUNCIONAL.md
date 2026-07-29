# Mapa funcional: pantalla, API, Java y datos

Este mapa permite a un programador nuevo seguir una acción desde la interfaz
hasta PostgreSQL. Los nombres de rutas exactos y sus cuerpos están en
[ENDPOINTS.md](../02-arquitectura/ENDPOINTS.md).

| Área visible | API principal | Controller → Service → Repository | Persistencia / archivos | Permiso |
|---|---|---|---|---|
| Login y sesión | `/api/auth/**` | `AuthController` → `AuthService` → `AuthRepository` | `local_users`, `local_sessions`, roles/permisos | pública al ingresar; sesión luego |
| Abrir / nuevo paciente | `/api/clinical/patients/**` | `PatientController` / `PatientWorkspaceController` → `PatientService` → `PatientRepository` | `patients`, `hcop_patient_documents` | `section.history.view/edit` |
| Hoja clínica | `/api/hc` | `ClinicalDocumentController` → `PatientDocumentService` → `PatientDocumentRepository` | `hcop_patient_documents.document_json` | `section.history.view/edit` |
| Diagnóstico | `/api/clinical/patients/{id}/diagnoses/**` y catálogos | `DiagnosisController` + catalog controllers | `oncology.diagnosisRecords` en la hoja; catálogos locales | `section.history.view/edit` |
| Estudios | `/api/media/studies/**`, `/api/media/images/**` | `ClinicalFileController` → `ClinicalFileService` → `ClinicalFileRepository` | `clinical_files` + `HCOP_STORAGE_ROOT` + referencias en `studies` | `section.studies.view/edit` |
| Plantillas anatómicas | `/api/study-templates/**` | `StudyTemplateController` → servicios de archivos/configuración | biblioteca local y `clinical_configuration_items` | ver estudios / gestionar configuración |
| Nuevo tratamiento | `/api/clinical/patients/{id}/treatments` | `TreatmentController` → `TreatmentService` → `TreatmentRepository` | `clinical_treatments`, detalle, ciclos, evolución en hoja | `section.prescriptions.edit` |
| Detalle/documentos | `/api/clinical/**/treatments/**` | `TreatmentController`, `TreatmentDocumentController` → servicios de tratamiento/documentos | tratamiento, detalle, turnos y archivos | `section.prescriptions.view` |
| Farmacia y logística | rutas de logistics/infusions | `InfusionController` → `InfusionService` → `InfusionRepository` | `treatment_cycle_logistics`, sesiones y medicamentos | `section.day-hospital.view/edit` |
| Turnero por sillón | `/api/clinical/infusions/**` | `InfusionController` → `InfusionService` → `InfusionRepository` | `unified_infusion_sessions`; trigger anti-superposición | `section.day-hospital.view/edit` |
| QR y administración | `/api/clinical/qr/**` | `QrWorkflowController` → `QrWorkflowService` → `QrWorkflowRepository` | turnos, `clinical_qr_scan_events`, evolución y auditoría | `section.day-hospital.view/edit` |
| Suspensión/continuidad | `/api/clinical/treatments/**/workflow/**` | `TreatmentWorkflowController` → `TreatmentWorkflowService` → `TreatmentWorkflowRepository` | estados, solicitudes, eventos y evolución | permisos `workflow.*` |
| Protocolos | `/api/config/protocols/**` | `ProtocolController` → `ConfigurationService` → `ConfigurationRepository` | elementos/versiones + estimación de duración | `section.protocols.view/edit` |
| Guías | `/api/guides/**` | `GuideCatalogController` → `GuideCatalogService` | catálogos/archivos locales y configuración | herramientas/configuración |
| Calculadoras y formularios | `/api/config` y catálogos | `ConfigurationController` → `ConfigurationService` → `ConfigurationRepository` | elementos y versiones de configuración | `section.configuration.view/manage` |
| Agente / línea de tiempo LLM | `/api/llm/**` | `LlmController` → `LlmClient` / `SystemConfigService` | `system_settings`, clave cifrada | agente, timeline o configuración |
| Usuarios y permisos | `/api/admin/**` | `AdminController` → `AdminService` → `AdminRepository` | usuarios, roles, permisos y seguridad | `admin.*` |
| Estado operativo | `/api/runtime/status`, `/api/clinical/status`, `/actuator/health` | `StatusController` y Actuator | consulta de PostgreSQL y runtime | público salvo detener |

## Flujo de una prescripción

1. La UI pide opciones y requisitos al `TreatmentController`.
2. El usuario elige un diagnóstico existente y un esquema.
3. `TreatmentService` valida diagnóstico, antropometría, ciclos y duración.
4. Una transacción crea `clinical_treatments`, `treatment_details` y una fila
   de `treatment_cycle_logistics` por ciclo.
5. En la misma operación agrega una evolución a la hoja clínica.
6. Los ciclos aptos aparecen en la lista de espera ordenados por fecha.
7. Farmacia actualiza medicación/prescripción por ciclo.
8. El turnero reserva fecha, hora, sillón y duración.
9. El QR abre el ciclo correcto; iniciar/finalizar administración actualiza el
   turno y documenta el hecho.

Si cualquier paso transaccional falla, no debe quedar media prescripción.

## Flujo de la hoja clínica

1. La sesión identifica al paciente activo.
2. `GET /api/hc` devuelve `document_json` y `revision`.
3. La UI edita una copia local y conserva el orden de secciones.
4. `PUT /api/hc` envía el documento y revisión esperada.
5. El repositorio actualiza con una condición sobre `revision`.
6. Un cambio concurrente produce `409`; la UI debe releer antes de continuar.

Los actos provenientes de tratamientos, QR o workflows agregan evoluciones
desde el servicio, no dependen de que una pestaña del navegador quede abierta.

## Datos relacionales frente a JSON

Se usa JSONB para la hoja narrativa y definiciones variables. Se usan tablas
relacionales para identidad, seguridad, tratamiento, ciclos, turnos,
medicamentos, solicitudes, archivos y auditoría porque necesitan integridad,
consultas, concurrencia o relaciones.

No debe duplicarse una regla en ambos lados sin definir autoridad:

- identidad: `patients`;
- narrativa/diagnósticos/evoluciones: hoja JSON;
- estado operativo de tratamiento: tablas de tratamiento;
- turno real: `unified_infusion_sessions`;
- archivo binario: storage; metadatos: `clinical_files`;
- protocolo vigente: configuración; copia histórica: tratamiento.

## Dónde agregar código

- contrato HTTP y permiso: `controller`;
- validación clínica, transacción e idempotencia: `service`;
- SQL parametrizado: `repository`;
- restricción que debe resistir concurrencia: migración PostgreSQL;
- representación visual: `src/main/resources/static`;
- contrato público: `OpenApiConfiguration` y pruebas;
- explicación: documento correspondiente y mapa funcional.
