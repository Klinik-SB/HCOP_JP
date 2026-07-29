# Campos y relaciones

## Paciente

| Pantalla | Tabla/campo | Recuperación |
|---|---|---|
| Nombre y apellido | `patients.first_name`, `last_name` | paciente activo |
| DNI | `patients.document_number` | búsqueda e identidad |
| HC | `patients.medical_record_number` | búsqueda e identidad |
| Obra social | `patients.health_insurance` | cabecera, farmacia, turno |
| N.º afiliado | `patients.health_insurance_number` | receta, farmacia, turno |
| Fecha de nacimiento | `patients.birth_date` | cabecera y edad calculada |
| Sexo | `patients.sex` | historia y requisitos |

## Historia clínica

La vista de papel lee `hcop_patient_documents.document_json`. La columna
`revision` se copia a `meta.persistenceRevision` y debe volver en cada guardado.

Rutas frecuentes del JSON:

- `oncology.diagnosisRecords`;
- `narrative.chiefComplaint`;
- `narrative.currentIllness`;
- `personalHistory`;
- `exam`;
- `studies`;
- `oncology.systemicTreatments`;
- `oncology.surgeries`;
- `evolutions`.

## Diagnóstico y tratamiento

`clinical_treatments.patient_id` referencia al paciente y `diagnosis_id`
referencia lógicamente el `id` inmutable del diagnóstico dentro de la historia.
También conserva la descripción para lectura histórica.

El esquema se guarda como `scheme_id` y `scheme_name`: el nombre histórico no
cambia aunque el protocolo sea editado después.

## Ciclos y turnos

Cada tratamiento crea una fila de `treatment_cycle_logistics` por ciclo. La
fecha planificada es:

```text
primer ciclo + (número de ciclo - ciclo inicial) × intervalo
```

Al turnar, `unified_infusion_sessions` relaciona paciente, tratamiento y ciclo.
La fecha real del turno prevalece en la vista operativa.

## Archivos

`clinical_files.storage_key` apunta a un archivo del volumen Docker. La base
guarda nombre original, tipo MIME, tamaño, SHA-256, paciente, tratamiento y
metadatos. No se almacena un archivo clínico en Git.
