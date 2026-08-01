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
