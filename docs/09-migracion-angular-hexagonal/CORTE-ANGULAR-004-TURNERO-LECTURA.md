# Corte Angular 004 - Turnero por sillones

El boton principal de Hospital de dia abre el modal Angular, sin iframe ni
ejecucion del JavaScript legacy. Esta primera superficie conserva:

- fecha y dia operativos, con navegacion diaria;
- configuracion real de sillones, intervalo, apertura y cierre;
- lista de aplicaciones pendientes con busqueda y filtros;
- navegacion horizontal y zoom de sillones;
- turnos existentes, azules sin confirmar y rojos confirmados;
- busqueda simultanea en espera y agenda.

La colocacion y el movimiento por arrastre se incorporan en el siguiente corte
sobre los endpoints transaccionales existentes. PostgreSQL continua siendo la
autoridad para rechazar superposiciones y cambios concurrentes.
