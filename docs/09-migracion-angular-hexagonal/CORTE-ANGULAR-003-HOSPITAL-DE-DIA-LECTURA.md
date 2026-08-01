# Corte Angular 003 · Hospital de Día: lectura clínica y operativa

## Propósito

Este corte traslada al frontend Angular la primera superficie de Hospital de
Día sin duplicar reglas clínicas en el navegador. Conserva el lenguaje visual
del sistema vigente y consume las mismas rutas auditables del backend Java.

## Alcance entregado

- La pestaña **H. de día** ya no redirige al frontend legado.
- Presenta los tratamientos del paciente activo como tarjetas expandibles.
- Cada tarjeta muestra esquema, diagnóstico, profesional, estado, cantidad de
  ciclos, duración estimada y rango de fechas.
- Al expandirla, Angular consulta el detalle local y muestra la jerarquía real
  `tratamiento → ciclo → día de aplicación → drogas y turno`.
- Los días y las drogas no se recalculan en el navegador: provienen de
  `GET /api/clinical/patients/{patientId}/treatments/{treatmentId}/detail`,
  que aplica la misma política de planificación que Hospital de Día.
- Las subpestañas **Aplicaciones**, **Farmacia**, **Triaje**, **Preparación** y
  **Administración** leen las colas existentes de
  `GET /api/clinical/application-workflows`.
- Cada fila abre un detalle Angular que reúne identidad, turno, drogas,
  reservas de stock, estado de los cinco pasos y auditoría por revisión.
- El detalle se recupera de
  `GET /api/clinical/application-workflows/{patientId}/{treatmentId}/{cycleNumber}/{applicationDay}`
  y se cierra únicamente con su botón explícito.

## Primera transición operativa migrada

La cola de Farmacia permite abrir la aplicación y aprobar o rechazar la orden.
Angular envía al backend:

- revisión esperada del circuito;
- clave única de idempotencia;
- resultado de la validación;
- procedencia o custodia de la medicación;
- observación o motivo obligatorio del rechazo.

La transición usa el endpoint `pharmacy-validation`; el servidor conserva la
autoridad sobre drogas prescriptas, permisos, estados permitidos y auditoría.

## Límites deliberados de este corte

Las transiciones restantes (reservar stock, PASS/FAIL de triaje, preparar,
liberar y administrar) continúan en la interfaz estable
mientras se migran como formularios Angular con revisión optimista,
idempotencia y campos completos. No se agregaron botones sin efecto ni se
alteró la lógica Java/PostgreSQL.

## Contrato y seguridad

| Necesidad Angular | Ruta | Regla que sigue siendo autoridad |
|---|---|---|
| Resumen de tratamiento | `GET /api/clinical/patients/{id}/treatments` | Permiso `section.prescriptions.view` |
| Ciclos, días, drogas y turnos | `GET /api/clinical/patients/{id}/treatments/{treatmentId}/detail` | `TreatmentCycleTimeline` |
| Aplicaciones agendadas | `GET /api/clinical/infusions?patientId={id}` | Permiso `section.day-hospital.view` |
| Cola de un rol | `GET /api/clinical/application-workflows?queue=…` | Permiso `section.day-hospital.view` |

Angular sólo normaliza texto, fechas y presentación. El cálculo de días de
aplicación, la duración, la disponibilidad de stock, la autorización clínica y
la trazabilidad permanecen en el servidor.

## Evidencia de validación

1. `npm.cmd run build` completó correctamente.
2. La imagen Docker se construyó con Node, Maven y Java 21.
3. En una base PostgreSQL temporal se verificaron:
   - host Angular servido en `/app/` sin `app.js` legado;
   - inicio de sesión;
   - alta de un paciente de prueba;
   - apertura de la historia;
   - consulta de tratamientos, infusiones y cola de Farmacia.

Los recursos usados para esa prueba son temporales y se eliminan al finalizar
la validación; no pertenecen a una instalación del usuario.

## Próximo corte

Migrar el detalle operativo de una aplicación y sus transiciones, comenzando
por Farmacia y Triaje. Cada acción conservará `expectedRevision`, clave de
idempotencia y registro de evolución que ya exponen los endpoints actuales.
