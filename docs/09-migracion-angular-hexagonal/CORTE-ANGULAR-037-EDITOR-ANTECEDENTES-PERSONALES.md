# Corte Angular 037: editor de Antecedentes personales

Fecha: 2026-08-02
Estado: implementado y validado localmente; no publicado

## Objetivo

Migrar **Antecedentes personales** a Angular real, sin iframe ni ejecución de
JavaScript legacy, conservando la disposición y el lenguaje clínico del
producto anterior. A diferencia de las narrativas simples de los cortes 035 y
036, esta sección mantiene cuatro campos independientes y genera una sola
instantánea clínica versionada por cada guardado.

## Recorrido visible

Una historia local vacía conserva el recuadro celeste tenue con `+ Cargar`. Si
ya existen antecedentes, la cabecera muestra el lápiz discreto para modificar.
El modal Angular nativo presenta el formulario en dos columnas:

- `narrative.backgroundClinical`: **Antecedentes clínicos / quirúrgicos**;
- `narrative.currentMedication`: **Medicación habitual**;
- `narrative.familyOncology`: **Antecedentes oncofamiliares**;
- `narrative.gynecology`: **Antecedentes gineco-obstétricos**.

La primera carga exige al menos uno de los cuatro campos. Una modificación
posterior exige motivo y puede cambiar uno, varios o todos los campos, incluso
dejarlos vacíos si la corrección queda documentada. Cada texto y el motivo
admiten hasta 50.000 caracteres.

El diálogo no se cierra al pulsar fuera, por Escape ni por tiempo. El foco
inicial entra en el primer campo, la navegación con `Tab` queda contenida y al
cancelar o guardar vuelve al disparador. Un error identifica el control exacto
con `aria-invalid`, lo asocia al mensaje y lleva allí el foco. Desde la apertura
se bloquean cambio o cierre de paciente, alta, configuración, logout, impresión
y otras mutaciones que podrían separar el borrador de su contexto.

## Cuatro campos y una instantánea

Los valores vigentes permanecen separados en `narrative`, pero la versión
histórica usa una instantánea legible y determinista. Sólo incluye campos con
contenido y conserva este orden:

1. `Clínicos / quirúrgicos: ...`;
2. `Medicación habitual: ...`;
3. `Oncofamiliares: ...`;
4. `Gineco-obstétricos: ...`.

Las líneas se unen con salto de línea. Si una modificación vacía los cuatro
campos, la versión guarda `Sin datos cargados.` en vez de una cadena ambigua.
El helper puro `clinical-personal-history-edit.ts` cubre compatibilidad,
normalización, primera carga, modificaciones, límites, instantáneas, versiones
y auditoría preliminar. Su suite contiene **14 casos y 104 aserciones**.

El registro global del borrador conserva únicamente token, paciente, etiqueta
y estado sucio; no duplica el contenido clínico. Antes del `PUT` Angular vuelve
a verificar que el paciente activo coincida con el capturado al abrir. Un error
HTTP conserva los cuatro campos y el motivo para reintentar. Un
`VERSION_CONFLICT` deriva una copia profunda al comparador sin sobrescribir la
revisión ganadora.

## Persistencia y autoridad Java

El documento clínico completo se conserva como JSONB en PostgreSQL. Este corte
actualiza los cuatro campos de `narrative` y utiliza una sola identidad de
sección:

- `meta.sectionFormModes.personalHistory = "structured"`;
- `meta.sectionVersions.personalHistory[]`, cuyo `content` es la instantánea;
- `meta.sectionAudit.personalHistory`;
- `meta.sectionChangeRequests.personalHistory.reason` como comando transitorio.

`ClinicalPersonalHistoryAuthority` delega la firma y el historial al motor
compartido `ClinicalNarrativeSectionAuthority`. Antes de persistir, Java compara
los cuatro valores contra el documento confirmado, valida únicamente los
campos realmente modificados, consume el motivo transitorio y descarta
versiones, auditoría, actor, fecha e identificadores aportados por el cliente.
Luego genera exactamente una versión canónica con el principal autenticado, la
matrícula, el reloj y el ID del servidor, preserva el resto del JSONB y devuelve
la nueva revisión confirmada.

Los doce códigos `400` específicos son:

- `CLINICAL_PERSONAL_HISTORY_BACKGROUND_CLINICAL_INVALID`;
- `CLINICAL_PERSONAL_HISTORY_BACKGROUND_CLINICAL_TOO_LONG`;
- `CLINICAL_PERSONAL_HISTORY_CURRENT_MEDICATION_INVALID`;
- `CLINICAL_PERSONAL_HISTORY_CURRENT_MEDICATION_TOO_LONG`;
- `CLINICAL_PERSONAL_HISTORY_FAMILY_ONCOLOGY_INVALID`;
- `CLINICAL_PERSONAL_HISTORY_FAMILY_ONCOLOGY_TOO_LONG`;
- `CLINICAL_PERSONAL_HISTORY_GYNECOLOGY_INVALID`;
- `CLINICAL_PERSONAL_HISTORY_GYNECOLOGY_TOO_LONG`;
- `CLINICAL_PERSONAL_HISTORY_EMPTY`;
- `CLINICAL_PERSONAL_HISTORY_REASON_REQUIRED`;
- `CLINICAL_PERSONAL_HISTORY_REASON_INVALID`;
- `CLINICAL_PERSONAL_HISTORY_REASON_TOO_LONG`.

La protección optimista por revisión y los permisos `section.history.view` y
`section.history.edit` siguen aplicándose fuera de esta autoridad.

## Compatibilidad y seguridad

Angular habilita el formulario estructurado sólo si los cuatro campos son
texto, nulos o ausentes y la historia está marcada como estructurada, o si es
una historia local nueva sin versiones previas. Una forma importada o legacy
no textual no se convierte silenciosamente: conserva su presentación anterior.

Java tampoco rechaza datos legacy atípicos que el usuario no intentó cambiar.
Al migrar conscientemente una sección anterior, sintetiza la carga inicial
antes de agregar la modificación, de modo que no se pierda el punto de partida.
Los metadatos enviados por el navegador nunca se consideran autoridad y el
comando de motivo se elimina antes de guardar.

## Evidencia automática

- helper puro de Antecedentes personales: 14 casos y 104 aserciones;
- compilación AOT estricta aprobada;
- ocho suites de autoridad Java, validator, MVC, permisos y Swagger: 66 pruebas
  aprobadas, sin fallos ni omitidas;
- OpenAPI: 8 operaciones documentadas verificadas;
- compilación Angular de producción aprobada dentro de la imagen Docker; el
  bundle inicial es 793,74 kB y conserva el aviso global conocido sobre el
  presupuesto de 750 kB, lejos del límite de error de 1,2 MB;
- cinco recorridos Playwright aprobados contra Java y PostgreSQL reales. El
  recorrido nuevo verificó carga parcial, foco contenido, cierre no accidental,
  `503` recuperable, motivo obligatorio, conflicto entre sesiones,
  comparación, descarte seguro, reintento y dos versiones canónicas con la
  instantánea ordenada.

El arnés Docker eliminó pacientes, contenedores, redes y volúmenes sintéticos.
El corte permanece local y no fue publicado.

## Estado de paridad

La interfaz Angular, la autoridad Java y la evidencia integrada de
**Antecedentes personales** están aprobadas. La fila general **Hoja clínica**
continúa `Pendiente` hasta migrar los formularios restantes y ofrecer el
historial visual equivalente por sección.

## Próximo corte seguro

Migrar **Examen físico** como el siguiente formulario compuesto, reutilizando
la protección de contexto y la firma canónica del servidor, respetando sus
campos propios sin reducirlo a una narrativa simple.
