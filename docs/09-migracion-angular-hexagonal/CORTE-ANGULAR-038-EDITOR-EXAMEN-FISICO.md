# Corte Angular 038: editor de Examen físico

Fecha: 2026-08-03
Estado: implementado y validado localmente; no publicado

## Objetivo

Migrar **Examen físico** a Angular real, sin iframe ni ejecución de JavaScript
legacy, manteniendo sus tres datos clínicos, las unidades históricas, los
cálculos antropométricos visibles, la plantilla opcional y una única cadena de
versiones firmada por Java.

## Contrato histórico auditado

La implementación anterior reúne en la misma sección:

- `exam.weightKg`: peso en kilogramos;
- `exam.heightM`: talla persistida en metros, aunque el formulario siempre la
  edita y presenta en centímetros;
- `narrative.physicalExam`: descripción clínica libre.

El formulario histórico presenta Peso y Talla en dos columnas y un textarea de
ocho filas a todo el ancho. Calcula en vivo IMC y Superficie corporal y ofrece
`Usar examen físico habitual` como acción explícita. Esa plantilla nunca se
inserta automáticamente ni reemplaza texto existente.

La hoja muestra Peso en kg y Talla en cm; cuando ambas medidas son válidas,
también presenta IMC y Superficie corporal. El texto se proyecta en las mismas
filas reconocibles del producto anterior: `Estado general`, `Tórax`, `Corazón`,
`Abdomen`, `SNC` y `Tacto rectal`. Si no encuentra un marcador, todo el texto se
presenta como `Estado general`; si encuentra marcadores, respeta su orden de
aparición y omite segmentos vacíos.

## Recorrido Angular

Una historia local vacía conserva el recuadro celeste tenue con `+ Cargar`. Si
la sección tiene contenido, la cabecera muestra el lápiz discreto para
modificar. El modal Angular nativo conserva las dos columnas, el texto amplio y
las métricas en vivo. La primera carga exige al menos uno de los tres datos;
una modificación posterior exige motivo y puede corregir o vaciar cualquiera
de ellos.

El botón de plantilla sólo completa el textarea cuando está vacío. Si ya tiene
texto, lo conserva, muestra una explicación y devuelve el foco al campo. El
diálogo no se cierra al pulsar fuera, por Escape ni por tiempo. El foco queda
contenido con `Tab`, los errores identifican el control exacto mediante
`aria-invalid` y, al cancelar o guardar, el foco vuelve al disparador.

Desde la apertura se registra un borrador sin copiar contenido clínico al
registro global. Ese borrador bloquea cambio o cierre de paciente, alta,
configuración, logout, impresión y otras mutaciones incompatibles. Antes del
`PUT`, Angular comprueba nuevamente que el paciente activo sea el capturado al
abrir. Un error HTTP conserva los tres campos y el motivo; un
`VERSION_CONFLICT` deriva una copia profunda al comparador sin sobrescribir la
revisión ganadora.

## Unidades y cálculos

El contrato de edición usa:

- Peso: decimal entre **0,01 y 500 kg**.
- Talla: decimal entre **30 y 250 cm** en la interfaz.
- Texto clínico y motivo: hasta **50.000 caracteres** cada uno.

La talla visible se redondea a una décima de centímetro y, cuando cambia, se
persiste en `exam.heightM` como metros con hasta cuatro decimales. Por ejemplo,
`170,123 cm` se normaliza a `170,1 cm` y se guarda como `1.701`. Para no romper
historias anteriores, la lectura interpreta valores menores o iguales a 3 como
metros y valores mayores a 3 como centímetros. Una medida legacy fuera del
rango nuevo se conserva mientras el usuario no intente modificarla.

Las métricas son derivadas y no se guardan como nuevos campos:

- IMC: `pesoKg / tallaM²`, mostrado con dos decimales;
- Superficie corporal de Du Bois:
  `0,007184 × pesoKg^0,425 × tallaCm^0,725`, mostrada con tres decimales.

### Deuda de fórmula explícita

Examen físico replica **Du Bois** porque es la fórmula del frontend histórico y
de `TreatmentService`. Prescripción y Calculadoras actualmente usan
**Mosteller**. Este corte no unifica ambas fórmulas: hacerlo podría cambiar
resultados que intervienen en dosis y exige una decisión clínica, migración y
pruebas específicas. Por eso la interfaz rotula el resultado simplemente como
`Superficie corporal` dentro de Examen físico y no lo presenta como una regla
global del sistema.

## Instantánea e historial

Los valores vigentes permanecen en sus tres rutas JSONB, pero cada guardado
genera una sola instantánea clínica en este orden:

1. `Peso: ... kg`, si existe;
2. `Talla: ... cm`, si existe;
3. las filas normalizadas del examen libre.

Una modificación que vacía toda la sección guarda `Sin datos cargados.`. Si una
historia anterior tiene contenido pero no posee una carga inicial versionada,
la primera modificación sintetiza esa versión antes de agregar la nueva. Los
metadatos de la sección son:

- `meta.sectionFormModes.physicalExam = "structured"`;
- `meta.sectionVersions.physicalExam[]`;
- `meta.sectionAudit.physicalExam`;
- `meta.sectionChangeRequests.physicalExam.reason` como comando transitorio.

## Autoridad Java y contrato REST

`ClinicalPhysicalExamAuthority` recibe el documento después de
`ClinicalDocumentChangeValidator`. Java compara únicamente los tres campos con
la revisión confirmada, consume el motivo transitorio y descarta versiones,
auditoría, actor, fecha e identificadores aportados por el navegador. Luego
reconstruye exactamente una versión con el principal autenticado, matrícula,
reloj e ID del servidor, preserva el resto del JSONB y devuelve la revisión
canónica.

Los diez códigos `400` específicos son:

- `CLINICAL_PHYSICAL_EXAM_WEIGHT_INVALID`;
- `CLINICAL_PHYSICAL_EXAM_WEIGHT_OUT_OF_RANGE`;
- `CLINICAL_PHYSICAL_EXAM_HEIGHT_INVALID`;
- `CLINICAL_PHYSICAL_EXAM_HEIGHT_OUT_OF_RANGE`;
- `CLINICAL_PHYSICAL_EXAM_TEXT_INVALID`;
- `CLINICAL_PHYSICAL_EXAM_TEXT_TOO_LONG`;
- `CLINICAL_PHYSICAL_EXAM_EMPTY`;
- `CLINICAL_PHYSICAL_EXAM_REASON_REQUIRED`;
- `CLINICAL_PHYSICAL_EXAM_REASON_INVALID`;
- `CLINICAL_PHYSICAL_EXAM_REASON_TOO_LONG`.

La protección CAS por `meta.persistenceRevision` y los permisos
`section.history.view` y `section.history.edit` permanecen independientes de
esta autoridad.

## Compatibilidad y seguridad

Angular habilita el formulario estructurado cuando peso y talla son escalares,
el examen libre es texto y la historia está marcada como estructurada, o cuando
es una historia local nueva sin versiones. Una historia importada o con formas
no compatibles mantiene la última versión legacy para presentación; nunca se
coacciona un objeto o una colección a texto.

Java valida sólo los valores realmente modificados. De ese modo una medida
atípica heredada no impide editar otra sección y una talla histórica en cm no se
convierte en `17.500 cm` al versionar. El comando de motivo se elimina antes de
persistir y ningún metadato clínico enviado por el cliente se considera
autoridad.

Si una edición de **Examen físico** recibe `exam` como contenedor legacy no
objeto, Java responde `CLINICAL_PHYSICAL_EXAM_WEIGHT_INVALID`; si el contenedor
`narrative` no es un objeto, responde `CLINICAL_PHYSICAL_EXAM_TEXT_INVALID`.
Una edición de cualquier otra sección conserva ambos contenedores malformados
sin bloquearse ni convertirlos silenciosamente.

## Evidencia automática

- helper puro de Examen físico: **14 casos y 83 aserciones aprobadas**;
- proyección de impresión: **6 casos y 28 aserciones aprobadas**;
- autoridad Java, validator, contrato MVC, permisos y OpenAPI focal:
  **81/81 pruebas aprobadas**;
- recorrido integrado Docker/Playwright: **6/6 escenarios aprobados**;
- bundle Angular de producción: **815.85 kB**. Supera el presupuesto preventivo
  de advertencia de **750 kB**, pero permanece por debajo del límite que hace
  fallar la compilación;
- el arnés efímero eliminó al finalizar pacientes sintéticos, contenedores,
  redes y volúmenes.

El corte quedó implementado y validado localmente. No fue publicado.

## Estado de paridad

La interfaz Angular, la autoridad Java y el recorrido integrado de **Examen
físico** están validados. La fila general **Hoja clínica** continúa `Pendiente`
únicamente hasta coordinar Estudios complementarios con su panel y ofrecer el
historial visual equivalente por sección.

## Próximo corte seguro

Migrar **Estudios complementarios en la hoja clínica**, coordinando carga y
edición con el panel Estudios para que ambos accesos trabajen sobre una sola
fuente de datos y no dupliquen archivos ni acciones.
