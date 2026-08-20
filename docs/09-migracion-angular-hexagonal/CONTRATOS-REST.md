# Contratos REST de la migración

Este documento fija las convenciones que deben respetar simultáneamente la
interfaz vigente, Angular y los adaptadores HTTP del backend hexagonal. OpenAPI
es el contrato ejecutable; este texto explica las decisiones que no conviene
repetir en cada endpoint.

## Compatibilidad durante la convivencia

- Una ruta existente no cambia de método, dirección ni significado.
- Un campo existente no cambia de nombre, tipo o unidad.
- Un campo nuevo sólo puede ser aditivo y debe tener un valor por defecto
  seguro para el consumidor anterior.
- Los DTO nuevos se incorporan por capacidad. Mientras una pantalla antigua
  necesite JSON dinámico, el adaptador traduce ese contrato al comando tipado de
  aplicación.
- Angular utiliza el cliente generado desde OpenAPI. No mantiene manualmente
  una segunda definición de las mismas respuestas.

## Éxito

Las altas responden `201 Created`. Una modificación responde `200 OK` mientras
el frontend vigente necesite el recurso actualizado en el cuerpo. Las consultas
responden `200 OK`. Los archivos conservan su tipo MIME real.

Durante la convivencia se mantienen los contenedores históricos como:

```json
{
  "ok": true,
  "item": {},
  "total": 1
}
```

Cada capacidad migrada sustituirá internamente los mapas por DTO, pero no
cambiará la forma JSON sin una versión explícita del endpoint.

## Error general

Todo error gestionado utiliza `ApiError`:

```json
{
  "ok": false,
  "error": "Mensaje seguro para el usuario",
  "code": "CODIGO_ESTABLE_OPCIONAL",
  "status": 409
}
```

`error` se puede mostrar. `code` se usa para decisiones automáticas y puede
omitirse durante la compatibilidad. El frontend no debe decidir leyendo el
texto del mensaje. `status` coincide siempre con el estado HTTP.

Una ruta protegida sin sesión usa `AuthenticationRequired`, conservando los
indicadores de la interfaz anterior:

```json
{
  "ok": false,
  "authenticated": false,
  "loginRequired": true,
  "error": "Debe iniciar sesión.",
  "code": "AUTHENTICATION_REQUIRED",
  "status": 401
}
```

No se devuelven excepciones, SQL, rutas locales, secretos ni datos clínicos en
mensajes técnicos.

## Identificadores

- Los identificadores se tratan como opacos fuera del módulo propietario.
- Angular no calcula ni incrementa identificadores.
- Los identificadores que hoy pueden superar el entero seguro de JavaScript se
  representan como texto en los DTO nuevos.
- `patientId`, `treatmentId`, `cycleNumber` y `applicationDay` identifican una
  aplicación clínica concreta.

## Fechas, horas y zona

| Concepto | Tipo de contrato | Ejemplo |
|---|---|---|
| Día clínico sin hora | ISO `LocalDate` | `2026-07-30` |
| Instante auditable | ISO `Instant` en UTC | `2026-07-30T12:15:00Z` |
| Hora de configuración | `HH:mm` | `08:00` |
| Duración | minutos enteros | `90` |

La zona clínica del sistema es `America/Argentina/Buenos_Aires`. El servidor
calcula el día clínico usando esa zona y persiste los instantes auditables en
UTC. El frontend sólo formatea para presentación; no cambia el día de un turno
por conversión implícita.

## Estados

- Los estados viajan como códigos estables en minúsculas y `snake_case`.
- La etiqueta en español pertenece a la presentación o a un catálogo, no al
  valor persistido.
- Un estado desconocido no se convierte silenciosamente: produce `400` si el
  comando es inválido o se presenta como desconocido si proviene de datos
  históricos.
- Las transiciones clínicas se validan en el dominio aunque el botón esté
  deshabilitado en Angular.

## Concurrencia

Los recursos editables publican `revision`. Todo comando que pueda pisar la
acción de otra persona envía `expectedRevision`. PostgreSQL actualiza sólo si
coincide:

1. el cliente lee revisión `N`;
2. envía el comando con `expectedRevision: N`;
3. el servidor persiste revisión `N + 1`;
4. si otro actor ya cambió el recurso, responde `409`;
5. Angular vuelve a leer y muestra el cambio antes de permitir una nueva
   decisión.

Nunca se reintenta automáticamente un `409` clínico.

La relectura de `GET /api/clinical/patients/{id}/workspace` devuelve
`Cache-Control: no-store` y `Pragma: no-cache`. Un comparador de conflictos debe
realizar esa lectura sin activar al paciente ni reemplazar el workspace visible.

Para `PUT /api/hc`, los conflictos poseen códigos inequívocos:

| Código | Condición |
|---|---|
| `ACTIVE_PATIENT_REQUIRED` | No hay paciente activo en la sesión. |
| `CLINICAL_REVISION_REQUIRED` | Falta `meta.persistenceRevision` o no es positiva. |
| `CLINICAL_PATIENT_MISMATCH` | La identidad del documento no coincide con el paciente activo. |
| `VERSION_CONFLICT` | La revisión esperada ya no es la vigente. |

Un cliente sólo trata como colisión de versión el código `VERSION_CONFLICT`.
Un `409` sin código se conserva como `UNKNOWN_CLINICAL_CONFLICT`, nunca se
convierte en conflicto de revisión leyendo el mensaje destinado al usuario y
tampoco se reintenta automáticamente.

Para el campo estructurado **Motivo de consulta**, `PUT /api/hc` compara
`narrative.chiefComplaint` contra el documento confirmado. Sólo valida el
campo cuando cambió, de modo que una forma legacy atípica sin cambios no
bloquee otra edición:

| Código `400` | Condición |
|---|---|
| `CLINICAL_CHIEF_COMPLAINT_INVALID` | El nuevo valor no es texto. |
| `CLINICAL_CHIEF_COMPLAINT_TOO_LONG` | El nuevo texto supera 50.000 caracteres. |
| `CLINICAL_CHIEF_COMPLAINT_EMPTY` | La primera carga está vacía. |
| `CLINICAL_CHIEF_COMPLAINT_REASON_REQUIRED` | Una modificación no incluye motivo. |
| `CLINICAL_CHIEF_COMPLAINT_REASON_INVALID` | El motivo transitorio no es texto. |
| `CLINICAL_CHIEF_COMPLAINT_REASON_TOO_LONG` | El motivo supera 50.000 caracteres. |

Una modificación posterior puede vaciar el campo para documentar la ausencia
actual, pero debe incluir motivo y genera una nueva versión. El motivo viaja
únicamente en `meta.sectionChangeRequests.chiefComplaint.reason`; Java lo
consume, lo retira antes de persistir y reconstruye
`meta.sectionVersions.chiefComplaint`, `meta.sectionAudit.chiefComplaint` y
`meta.sectionFormModes.chiefComplaint` desde PostgreSQL, la sesión autenticada
y el reloj del servidor.

Para **Antecedentes de enfermedad actual**, el mismo `PUT /api/hc` compara
`narrative.currentIllness` con el documento confirmado y sólo valida el campo
si realmente cambió. Los códigos de validación son independientes de los de
otras secciones narrativas:

| Código `400` | Condición |
|---|---|
| `CLINICAL_CURRENT_ILLNESS_INVALID` | El nuevo valor no es texto. |
| `CLINICAL_CURRENT_ILLNESS_TOO_LONG` | El nuevo texto supera 50.000 caracteres. |
| `CLINICAL_CURRENT_ILLNESS_EMPTY` | La primera carga está vacía. |
| `CLINICAL_CURRENT_ILLNESS_REASON_REQUIRED` | Una modificación no incluye motivo. |
| `CLINICAL_CURRENT_ILLNESS_REASON_INVALID` | El motivo transitorio no es texto. |
| `CLINICAL_CURRENT_ILLNESS_REASON_TOO_LONG` | El motivo supera 50.000 caracteres. |

Una versión posterior puede vaciar la sección si documenta el motivo. Angular
envía ese comando únicamente en
`meta.sectionChangeRequests.currentIllness.reason`; Java lo consume y lo retira
antes de persistir. `ClinicalCurrentIllnessAuthority`, mediante la autoridad
narrativa compartida, reconstruye `meta.sectionVersions.currentIllness`,
`meta.sectionAudit.currentIllness` y
`meta.sectionFormModes.currentIllness = "structured"` con el actor autenticado,
el reloj y el identificador generados por el servidor. La historia permanece en
el JSONB de PostgreSQL y la respuesta devuelve su forma canónica.

Para **Antecedentes personales**, `PUT /api/hc` trata como una unidad clínica
los cuatro campos `narrative.backgroundClinical`,
`narrative.currentMedication`, `narrative.familyOncology` y
`narrative.gynecology`. Cada valor vigente permanece separado en el JSONB, pero
una modificación genera una sola versión en `personalHistory` con una
instantánea ordenada de los campos que tienen contenido.

| Código `400` | Condición |
|---|---|
| `CLINICAL_PERSONAL_HISTORY_BACKGROUND_CLINICAL_INVALID` | Clínicos / quirúrgicos cambió y no es texto. |
| `CLINICAL_PERSONAL_HISTORY_BACKGROUND_CLINICAL_TOO_LONG` | Clínicos / quirúrgicos supera 50.000 caracteres. |
| `CLINICAL_PERSONAL_HISTORY_CURRENT_MEDICATION_INVALID` | Medicación habitual cambió y no es texto. |
| `CLINICAL_PERSONAL_HISTORY_CURRENT_MEDICATION_TOO_LONG` | Medicación habitual supera 50.000 caracteres. |
| `CLINICAL_PERSONAL_HISTORY_FAMILY_ONCOLOGY_INVALID` | Oncofamiliares cambió y no es texto. |
| `CLINICAL_PERSONAL_HISTORY_FAMILY_ONCOLOGY_TOO_LONG` | Oncofamiliares supera 50.000 caracteres. |
| `CLINICAL_PERSONAL_HISTORY_GYNECOLOGY_INVALID` | Gineco-obstétricos cambió y no es texto. |
| `CLINICAL_PERSONAL_HISTORY_GYNECOLOGY_TOO_LONG` | Gineco-obstétricos supera 50.000 caracteres. |
| `CLINICAL_PERSONAL_HISTORY_EMPTY` | La primera carga no contiene ninguno de los cuatro campos. |
| `CLINICAL_PERSONAL_HISTORY_REASON_REQUIRED` | Una modificación no incluye motivo. |
| `CLINICAL_PERSONAL_HISTORY_REASON_INVALID` | El motivo transitorio no es texto. |
| `CLINICAL_PERSONAL_HISTORY_REASON_TOO_LONG` | El motivo supera 50.000 caracteres. |

La instantánea usa siempre el orden Clínicos / quirúrgicos, Medicación
habitual, Oncofamiliares y Gineco-obstétricos; omite líneas vacías y documenta
`Sin datos cargados.` si una modificación elimina todo el contenido. El motivo
viaja únicamente en `meta.sectionChangeRequests.personalHistory.reason`.
`ClinicalPersonalHistoryAuthority` consume ese comando y reconstruye
`meta.sectionVersions.personalHistory`, `meta.sectionAudit.personalHistory` y
`meta.sectionFormModes.personalHistory = "structured"` con el principal, el
reloj y el identificador del servidor. Una forma legacy no textual que no se
modifica se conserva sin coerción ni bloqueo de otras secciones.

Para **Examen físico**, `PUT /api/hc` trata como una unidad clínica
`exam.weightKg`, `exam.heightM` y `narrative.physicalExam`. El peso puede ser un
número o texto decimal en kg. La API persiste la talla en metros, aunque Angular
la edita entre 30 y 250 cm y la normaliza a una décima antes de convertirla. La
lectura compatible interpreta una talla histórica mayor a 3 como centímetros.

| Código `400` | Condición |
|---|---|
| `CLINICAL_PHYSICAL_EXAM_WEIGHT_INVALID` | El peso nuevo o modificado no es un número finito. |
| `CLINICAL_PHYSICAL_EXAM_WEIGHT_OUT_OF_RANGE` | El peso nuevo o modificado está fuera de 0,01–500 kg. |
| `CLINICAL_PHYSICAL_EXAM_HEIGHT_INVALID` | La talla nueva o modificada no es un número finito. |
| `CLINICAL_PHYSICAL_EXAM_HEIGHT_OUT_OF_RANGE` | `exam.heightM` nuevo o modificado está fuera de 0,3–2,5 m. |
| `CLINICAL_PHYSICAL_EXAM_TEXT_INVALID` | `narrative.physicalExam` cambió y no es texto. |
| `CLINICAL_PHYSICAL_EXAM_TEXT_TOO_LONG` | El texto supera 50.000 caracteres. |
| `CLINICAL_PHYSICAL_EXAM_EMPTY` | La primera carga no contiene peso, talla ni examen libre. |
| `CLINICAL_PHYSICAL_EXAM_REASON_REQUIRED` | Una modificación no incluye motivo. |
| `CLINICAL_PHYSICAL_EXAM_REASON_INVALID` | El motivo transitorio no es texto. |
| `CLINICAL_PHYSICAL_EXAM_REASON_TOO_LONG` | El motivo supera 50.000 caracteres. |

La versión `physicalExam` contiene Peso, Talla en cm y las filas normalizadas
`Estado general`, `Tórax`, `Corazón`, `Abdomen`, `SNC` y `Tacto rectal` que
correspondan. El motivo viaja únicamente en
`meta.sectionChangeRequests.physicalExam.reason`.
`ClinicalPhysicalExamAuthority` consume ese comando y reconstruye
`meta.sectionVersions.physicalExam`, `meta.sectionAudit.physicalExam` y
`meta.sectionFormModes.physicalExam = "structured"` con el principal, el reloj
y el identificador del servidor. Una medida o forma legacy que no cambia se
preserva y no bloquea otras ediciones.

Cuando se intenta editar **Examen físico**, un contenedor legacy `exam` que no
sea objeto produce `CLINICAL_PHYSICAL_EXAM_WEIGHT_INVALID`; un contenedor
`narrative` que no sea objeto produce `CLINICAL_PHYSICAL_EXAM_TEXT_INVALID`.
Las escrituras de otras secciones preservan esos contenedores malformados sin
bloquearse ni coaccionarlos a otra forma.

IMC y Superficie corporal no forman parte del cuerpo persistido. Angular los
calcula para esta sección; por paridad histórica, la superficie usa Du Bois.
Prescripción y Calculadoras continúan usando Mosteller hasta que una decisión
clínica gobierne una eventual unificación.

Para los campos estructurados de **Conclusión / resumen**, `PUT /api/hc`
compara cada valor entrante contra el documento confirmado. Sólo valida un
campo cuando realmente cambió, para que una forma legacy atípica no impida
guardar otra sección:

| Código `400` | Condición |
|---|---|
| `CLINICAL_SUMMARY_INVALID` | `narrative.summary` cambió y no es texto. |
| `CLINICAL_SUMMARY_TOO_LONG` | El nuevo resumen supera 50.000 caracteres. |
| `CLINICAL_PLAN_INVALID` | `narrative.plan` cambió y no es texto. |
| `CLINICAL_PLAN_TOO_LONG` | El nuevo plan supera 50.000 caracteres. |
| `CLINICAL_SUMMARY_PLAN_EMPTY` | La primera carga no contiene resumen ni plan. |
| `CLINICAL_SUMMARY_PLAN_REASON_REQUIRED` | Una modificación no incluye motivo. |
| `CLINICAL_SUMMARY_PLAN_REASON_INVALID` | El motivo transitorio no es texto. |
| `CLINICAL_SUMMARY_PLAN_REASON_TOO_LONG` | El motivo supera 50.000 caracteres. |

El texto vacío es válido para documentar un vaciado. El servidor no recorta ni
normaliza silenciosamente: Angular normaliza extremos antes de enviar y el
documento persistido conserva exactamente el valor recibido.

El motivo viaja únicamente como comando transitorio en
`meta.sectionChangeRequests.summaryPlan.reason`. Java lo consume y elimina antes
de persistir. Las versiones, la auditoría, el actor y el instante de
`summaryPlan` se reconstruyen exclusivamente desde el documento ya confirmado,
la sesión autenticada y el reloj del servidor; cualquier valor homónimo enviado
por el navegador se ignora. La respuesta satisfactoria contiene `state`, que es
la copia canónica visible para ese usuario con la nueva
`meta.persistenceRevision`. Angular instala esa copia, no su borrador optimista.

## Idempotencia

Las transiciones clínicas que podrían repetirse por doble clic, reconexión o
reintento incluyen `idempotencyKey`, de 8 a 128 caracteres seguros. Repetir la
misma clave y el mismo comando devuelve el resultado registrado sin duplicar
evoluciones, reservas ni administraciones. Reutilizar una clave con otro
comando es un conflicto.

La clave la genera el cliente una vez por intención del usuario y permanece
estable durante sus reintentos.

## Archivos

Los archivos se transmiten como binario y se validan por extensión, tipo
declarado y firma real. La respuesta nunca expone una ruta del host. La
eliminación temporal de una carga exige el token emitido a la misma sesión.

## Criterio de aceptación de un endpoint migrado

1. Entrada y salida poseen DTO Java o adaptadores explícitos de compatibilidad.
2. Validación sintáctica en web y regla clínica en dominio.
3. Permiso documentado y probado.
4. Errores tipados en OpenAPI.
5. Fechas, estados y unidades cumplen este documento.
6. Escrituras concurrentes e idempotentes están cubiertas cuando corresponda.
7. La interfaz vigente y Angular reciben el mismo significado.
8. Hay prueba de éxito, validación, autorización y conflicto relevante.
