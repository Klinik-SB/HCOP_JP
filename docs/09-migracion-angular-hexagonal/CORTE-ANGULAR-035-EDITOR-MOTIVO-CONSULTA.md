# Corte Angular 035: editor de Motivo de consulta

Fecha: 2026-08-02
Estado: implementado y validado localmente; no publicado

## Objetivo

Migrar **Motivo de consulta** a Angular real, sin iframe ni ejecución de
JavaScript legacy, conservando su posición, geometría, contrato clínico,
permisos, versiones y auditoría. El corte reutiliza y robustece el patrón del
editor de Conclusión / resumen en vez de crear una vía paralela.

## Recorrido visible

Una historia local vacía muestra el mismo recuadro celeste tenue del producto
original, con `+ Cargar`. Cuando existe contenido aparece el lápiz discreto en
la cabecera. El modal contiene un `textarea` de cinco filas y mantiene el
lenguaje operativo histórico:

- primera carga: kicker `Cargar sección`, sin motivo manual y botón
  `Cargar en historia`;
- modificación: kicker `Modificar sección`, motivo obligatorio y botón
  `Guardar modificación`;
- límite de 50.000 caracteres;
- una primera carga vacía se rechaza;
- una versión posterior sí puede quedar vacía si se documenta el motivo.

El diálogo no se cierra por fondo, Escape ni tiempo. El foco entra en el campo,
`Tab` queda contenido y Cancelar o guardar devuelve el foco al disparador. Los
errores de contenido o motivo marcan el control con `aria-invalid`, lo vinculan
al mensaje y llevan allí el foco.

## Contexto y borrador

El registro global conserva únicamente token, paciente, etiqueta estática y
estado sucio; nunca copia texto clínico. Desde que un editor se abre —aunque
todavía esté limpio— bloquea cambio/cierre/alta de paciente, configuración,
logout, paneles, impresión y mutaciones de archivos. El guardado comprueba de
nuevo que el ID del paciente activo coincida con el del editor. Esto evita que
una transición pendiente, un atajo o tecnología asistiva aplique el borrador a
otra ficha.

Los extremos de texto se normalizan igual que al guardar, por lo que un valor
heredado con espacios no crea un borrador fantasma. Un error HTTP conserva el
modal y el contenido para reintento. Ante `VERSION_CONFLICT`, el servicio toma
una copia profunda del intento, el modal libera su token y el banner pasa a ser
el único propietario visible del borrador.

## Persistencia y autoridad Java

El valor vigente se guarda en `narrative.chiefComplaint` dentro del JSONB de la
historia. El helper Angular crea una previsualización compatible mediante:

- `meta.sectionFormModes.chiefComplaint = "structured"`;
- `meta.sectionVersions.chiefComplaint[]`;
- `meta.sectionAudit.chiefComplaint`;
- `meta.sectionChangeRequests.chiefComplaint.reason` como comando transitorio.

Java no confía en esa previsualización. `ClinicalNarrativeSectionAuthority`
centraliza la firma de secciones narrativas y es usado por
`ClinicalChiefComplaintAuthority` y por el editor ya existente de
Conclusión / resumen. Antes de persistir:

1. compara contra el documento confirmado;
2. preserva valores legacy no textuales o campos ausentes que no cambiaron;
3. valida texto, longitud, carga inicial y motivo;
4. retira el comando transitorio;
5. descarta auditoría y versiones falsificadas por el cliente;
6. agrega exactamente una versión con actor de sesión, matrícula, reloj e ID
   del servidor;
7. conserva el resto del documento y devuelve el estado canónico con la nueva
   revisión.

La protección CAS y los permisos `section.history.view` y
`section.history.edit` permanecen independientes de esta autoridad.

## Evidencia automática

- helper Motivo de consulta: 13 casos y 95 aserciones;
- helper Conclusión / resumen de regresión: 17 casos y 112 aserciones;
- registro de editores: 21 aserciones sin contenido clínico almacenado;
- validator, autoridad, contrato MVC, permisos y regresión Java: 35 pruebas
  focalizadas aprobadas;
- compilación Angular de producción aprobada;
- Docker construye el frontend Angular y el servidor Java desde el árbol
  actual y levanta PostgreSQL sin reutilizar la instancia estable;
- 3/3 recorridos Chrome aprobados: conflicto general, regresión de
  Conclusión / resumen y Motivo de consulta;
- el recorrido nuevo cubre foco, cierre no accidental, descarte cancelado,
  bloqueo desde editor limpio, `503` con reintento, `VERSION_CONFLICT` real en
  una segunda sesión, comparación, recuperación, modificación y dos versiones
  canónicas recuperadas de PostgreSQL;
- pacientes, contenedores, redes y volúmenes sintéticos eliminados al terminar.

La compilación conserva una advertencia no bloqueante: el bundle inicial mide
aproximadamente 771,5 kB frente al presupuesto de advertencia de 750 kB. No se
modificó el límite para ocultarla; el umbral de error de 1,2 MB no se alcanza.

## Estado de paridad

**Motivo de consulta** queda migrado de extremo a extremo. La fila general
**Hoja clínica** sigue `Pendiente` porque faltan otros editores y el historial
visual equivalente por sección.

## Próximo corte seguro

Migrar **Antecedentes de enfermedad actual** usando el mismo motor de sección
narrativa, sin duplicar autoridad, guardas de contexto ni manejo de conflicto.
