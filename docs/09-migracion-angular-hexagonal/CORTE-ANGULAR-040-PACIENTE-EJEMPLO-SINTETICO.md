# Corte Angular 040: paciente de ejemplo sintético

Fecha: 2026-08-03
Estado: implementado y documentado localmente; no publicado

## Objetivo

Entregar una instalación nueva con una historia completa y segura para recorrer
la interfaz sin cargar manualmente un paciente. La ficha es un caso compuesto
100 % ficticio de cáncer de colon y melanoma: identidad, cronología, hallazgos y
recorrido clínico fueron creados íntegramente desde cero. El recurso **jamás
contiene datos reales** ni deriva de una historia anonimizada o pseudonimizada.

## Configuración

Docker y los instaladores establecen de forma predeterminada:

```dotenv
HCOP_SEED_EXAMPLE_PATIENT=true
```

`HCOP_SEED_EXAMPLE_PATIENT=false` desactiva la creación, reparación y
actualización administrada de la hoja demostrativa. Cambiar a `false` no elimina
datos ya persistidos.
`compose.e2e.yaml` usa expresamente `false` para mantener aisladas las pruebas.

## Recurso y arranque

El único recurso de paciente demostrativo versionado está en
`src/main/resources/bootstrap/patients/test-savatierra-v3.json` y contiene el
caso compuesto ficticio. La identidad sintética se define en
`DefaultDemoPatientBootstrap` y conserva la clave estable
`hcop-default-test-savatierra-v1` para reconocer instalaciones ya sembradas; el
sufijo de esa clave no cambia con el nombre del recurso. El documento declara
`meta.demoContentVersion=3`; cada escritura administrada registra la revisión
resultante en `meta.demoManagedRevision`.

El orden de bootstrap es:

1. crear o recuperar el administrador local;
2. sembrar los catálogos clínicos;
3. crear o recuperar el paciente demostrativo y su hoja.

El usuario utilizado como actor de auditoría no inicia una sesión. El seed no
escribe `local_sessions.active_patient_id`, por lo que la ficha queda disponible
en el buscador pero nunca se abre automáticamente.

## Idempotencia y protección de datos

La instalación contiene ahora **12 migraciones Flyway**, de `V001` a `V012`.
`V012__patient_seed_identity.sql` crea el índice único parcial
`uq_patients_identity_seed_key` sobre `patients.identity_json ->> 'seedKey'`.
La línea base del 30/07/2026 y el corte 007 conservan el conteo histórico de 11
migraciones porque describen la evidencia disponible en esas fechas.

Java busca primero la clave del seed, inserta con `ON CONFLICT DO NOTHING` y
recupera la fila ganadora si dos instancias arrancan a la vez. Si existe la
ficha marcada pero falta su hoja, repara únicamente el documento ausente. El
bootstrap resuelve como best-effort las condiciones operativas previstas: una
colisión de DNI o número de historia con una ficha ajena, o la falta del actor
de auditoría, produce un warning y omite el ejemplo sin tomar posesión de esa
identidad ni bloquear el arranque.

Cuando la hoja ya existe, el contrato de actualización es conservador:

1. si `demoContentVersion` coincide con la versión del recurso, no escribe;
2. si el recurso es más nuevo y
   `revision == meta.demoManagedRevision`, reemplaza únicamente el contenido
   demostrativo y registra la nueva versión y revisión administrada;
3. si `revision != meta.demoManagedRevision`, considera que existió una edición
   humana y conserva el documento completo sin modificarlo.

Si dos instancias compiten por una actualización administrada, el bootstrap
relee el estado y acepta la escritura ganadora cuando ya satisface el contrato.
Si la carrera no puede resolverse con seguridad, registra un warning y termina
como no-op; nunca impide que la aplicación quede disponible.

Un recurso JSON ausente, malformado o con marcadores incompatibles no se trata
como una condición operativa: es un defecto del artefacto distribuido y se
propaga para impedir que una versión corrupta se considere saludable. Los
errores inesperados de infraestructura conservan igualmente el manejo normal de
Spring y PostgreSQL; no se silencian bajo la etiqueta best-effort.

Por lo tanto, reparar o actualizar sigue siendo idempotente. Una versión nueva
puede corregir o mejorar el ejemplo distribuido, pero nunca pisa trabajo humano.

La hoja queda marcada con `meta.demo=true`,
`meta.demoSeedKey="hcop-default-test-savatierra-v1"`,
`meta.demoContentVersion` y `meta.demoManagedRevision`. Estas marcas no
autorizan a mezclar datos reales: el recurso versionado y la ficha demostrativa
no deben usarse para asistencia ni convertirse en la historia de una persona.

## Cobertura automática

- `DefaultDemoPatientBootstrapTest` cubre habilitación, opt-out, repetición,
  reparación, concurrencia, warning y omisión ante colisión o falta de actor;
- la regresión de versiones comprueba no-op para la misma versión, actualización
  de una hoja intacta, resolución best-effort de conflictos optimistas y
  conservación absoluta después de una edición humana;
- la validación del recurso exige el caso ficticio colon/melanoma en versión 3;
  un JSON empaquetado inválido es un defecto de release y debe impedir publicar
  el artefacto, aunque el bootstrap de ejecución continúe siendo no bloqueante;
- `BootstrapConfigurationTest` verifica el orden de arranque;
- `DatabaseMigrationResourceTest` exige las 12 migraciones y la garantía de
  unicidad de `V012`;
- los recorridos E2E mantienen el seed desactivado para no alterar sus datos
  efímeros.

## Estado del corte

Este corte mejora la experiencia de una instalación vacía y la reproducibilidad
de las demostraciones con un caso creado desde cero. No cambia el estado de
paridad de las capacidades clínicas ni reemplaza las pruebas con pacientes
efímeros creados por cada arnés.
