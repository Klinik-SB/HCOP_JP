# Corte Angular 036: editor de Antecedentes de enfermedad actual

Fecha: 2026-08-02
Estado: implementado y validado localmente; no publicado

## Objetivo

Migrar **Antecedentes de enfermedad actual** a Angular real, sin iframe ni
ejecución de JavaScript legacy, conservando posición, geometría, permisos,
versiones, auditoría y compatibilidad con historias anteriores. Este corte no
abre una implementación paralela: extiende el editor narrativo común ya usado
por Motivo de consulta.

## Recorrido visible

Una historia local vacía muestra el recuadro celeste tenue del producto
original con `+ Cargar`. Si existe contenido, la cabecera muestra el lápiz
discreto para modificar. El modal conserva el campo amplio de ocho filas y el
lenguaje operativo de la hoja histórica:

- primera carga: kicker `Cargar sección`, sin motivo manual y botón
  `Cargar en historia`;
- modificación: kicker `Modificar sección`, motivo obligatorio y botón
  `Guardar modificación`;
- límite de 50.000 caracteres para contenido y motivo;
- una primera carga vacía se rechaza;
- una versión posterior puede quedar vacía si documenta el motivo.

El diálogo no se cierra por fondo, Escape ni tiempo. El foco entra en el campo,
`Tab` queda contenido y Cancelar o guardar devuelve el foco al disparador. Un
error de contenido o motivo marca el control con `aria-invalid`, lo vincula al
mensaje y mueve allí el foco.

## Motor Angular compartido

`clinical-single-narrative-edit-engine.ts` concentra la decisión de
compatibilidad, normalización, primera carga, modificación, versiones y
auditoría preliminar de las secciones narrativas simples. Los adaptadores de
Motivo de consulta y Antecedentes de enfermedad actual conservan sus APIs,
mensajes y códigos propios, evitando que la migración multiplique reglas casi
idénticas dentro del bundle.

El registro global de borradores conserva únicamente token, paciente, etiqueta
estática y estado sucio; nunca copia texto clínico. Desde la apertura, el editor
bloquea cambio, cierre o alta de paciente, configuración, logout, paneles,
impresión y mutaciones de archivos. Antes de guardar vuelve a comprobar que el
paciente activo coincida con el ID capturado al abrir.

Los extremos de texto se normalizan igual que al persistir. Un error HTTP deja
el modal y sus campos intactos para reintento. Ante `VERSION_CONFLICT`, una copia
profunda del intento pasa al flujo de comparación y recuperación sin
sobrescribir la revisión ganadora.

## Persistencia y autoridad Java

El valor vigente se guarda en `narrative.currentIllness` dentro del documento
JSONB de la historia clínica en PostgreSQL. Angular prepara la edición con:

- `meta.sectionFormModes.currentIllness = "structured"`;
- `meta.sectionVersions.currentIllness[]`;
- `meta.sectionAudit.currentIllness`;
- `meta.sectionChangeRequests.currentIllness.reason` como comando transitorio.

Java no confía en esa previsualización. `ClinicalCurrentIllnessAuthority`
delega la firma al motor común `ClinicalNarrativeSectionAuthority`. Antes de
persistir:

1. compara `narrative.currentIllness` con el documento confirmado;
2. preserva campos ausentes o valores legacy no textuales que no cambiaron;
3. valida tipo, longitud, primera carga y motivo;
4. consume y retira el comando transitorio;
5. descarta auditoría y versiones falsificadas por el cliente;
6. agrega exactamente una versión con actor de sesión, matrícula, reloj e ID
   del servidor;
7. conserva el resto del JSONB y devuelve el estado canónico con nueva revisión.

Los códigos `400` de esta sección son:

- `CLINICAL_CURRENT_ILLNESS_INVALID`;
- `CLINICAL_CURRENT_ILLNESS_TOO_LONG`;
- `CLINICAL_CURRENT_ILLNESS_EMPTY`;
- `CLINICAL_CURRENT_ILLNESS_REASON_REQUIRED`;
- `CLINICAL_CURRENT_ILLNESS_REASON_INVALID`;
- `CLINICAL_CURRENT_ILLNESS_REASON_TOO_LONG`.

La protección CAS y los permisos `section.history.view` y
`section.history.edit` permanecen independientes de esta autoridad.

## Evidencia automática

- adaptador puro de Antecedentes de enfermedad actual: 14 casos y 101
  aserciones;
- regresión del adaptador de Motivo de consulta sobre el motor compartido: 14
  casos y 101 aserciones;
- siete suites Java focalizadas, incluidas autoridades, validator, MVC,
  permisos y Swagger: 56 pruebas aprobadas, sin fallos ni omitidas;
- OpenAPI: 8 operaciones documentadas verificadas;
- compilación Angular de producción aprobada dentro de la imagen Docker; el
  bundle inicial es 776,37 kB y conserva el aviso global conocido sobre el
  presupuesto de 750 kB;
- cuatro recorridos Playwright aprobados contra Java y PostgreSQL reales. El
  recorrido dedicado verificó foco contenido, ausencia de cierre accidental,
  error `503` recuperable, primera carga, modificación con motivo,
  `VERSION_CONFLICT`, comparación, descarte seguro y dos versiones canónicas
  recuperadas desde PostgreSQL.

El arnés Docker finalizó con código cero y eliminó paciente, contenedores,
redes y volúmenes sintéticos.

## Estado de paridad

La implementación Angular, la autoridad Java y el E2E integrado de
**Antecedentes de enfermedad actual** están aprobados. La fila general **Hoja
clínica** continúa `Pendiente` porque faltan otros formularios y el historial
visual equivalente por sección.

## Próximo corte seguro

Migrar **Antecedentes personales** como formulario compuesto, reutilizando la
misma protección de contexto y la autoridad narrativa sin forzar sus varios
campos dentro del editor simple.
