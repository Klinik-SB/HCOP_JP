# Corte Angular 004 - Turnero por sillones

El boton principal de Hospital de dia abre el modal Angular, sin iframe ni
ejecucion del JavaScript legacy. Esta primera superficie conserva:

- fecha y dia operativos, con navegacion diaria;
- configuracion real de sillones, intervalo, apertura y cierre;
- lista de aplicaciones pendientes con busqueda y filtros;
- navegacion horizontal y zoom de sillones;
- turnos existentes, azules sin confirmar y rojos confirmados;
- busqueda simultanea en espera y agenda.

La seleccion marca en celeste solamente los inicios donde la aplicacion cabe.
El arrastre pinta todo el bloque en verde, o rojo si el horario dejo de estar
disponible. Tanto el alta como la reprogramacion usan los endpoints
transaccionales existentes con revision optimista. PostgreSQL continua siendo
la autoridad final para rechazar superposiciones y cambios concurrentes.

Cada bloque posee tres acciones directas: abrir el detalle completo de la
aplicacion, mover el turno y quitarlo. El detalle permite confirmar el turno o
retirarlo con motivo; al retirarlo, Java registra el evento y la aplicacion
vuelve a la lista de espera. Esta cancelacion tambien permanece disponible si
el tratamiento esta suspendido, siempre que no haya comenzado la etapa clinica.
