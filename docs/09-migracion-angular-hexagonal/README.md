# Migración Angular y arquitectura hexagonal

Esta carpeta gobierna la migración de HCOP JP. El objetivo es reemplazar el
frontend estático por Angular y evolucionar el backend hacia un monolito
modular hexagonal sin perder comportamiento, datos, permisos, documentación ni
capacidad de despliegue.

La versión operativa permanece disponible durante toda la transición. Cada
capacidad nueva se compara contra la línea base antes de habilitarse y el
frontend anterior sólo se retira cuando la matriz de paridad está completa.

## Documentos de control

- [Línea base](BASELINE-2026-07-30.md): evidencia técnica y funcional del punto
  de partida.
- [Matriz de paridad](MATRIZ-DE-PARIDAD.md): capacidades que deben conservarse y
  criterio de aceptación de cada una.
- [Arquitectura objetivo](ARQUITECTURA-OBJETIVO.md): módulos, capas, reglas de
  dependencia, Angular e infraestructura.
- [Contratos REST](CONTRATOS-REST.md): forma estable de respuestas, fechas,
  estados, concurrencia e idempotencia que consumirá Angular.
- [Reglas de arquitectura](REGLAS-ARQUITECTURA.md): límites hexagonales
  verificados automáticamente y kernel compartido.
- [Migración de Configuración](MIGRACION-CONFIGURACION.md): primer corte
  vertical, estrategia de convivencia y evidencia de paridad.
- [Migración de Protocolos](MIGRACION-PROTOCOLOS.md): unificación del catálogo
  COIR, protocolos locales, drogas y administración versionada.
- [Migración de Guías](MIGRACION-GUIAS.md): separación entre metadatos
  versionados y archivos, validación PDF y descargas seguras.
- [ADR-0001](adr/ADR-0001-MONOLITO-MODULAR-HEXAGONAL.md): monolito modular
  hexagonal.
- [ADR-0002](adr/ADR-0002-ANGULAR-Y-CONVIVENCIA.md): Angular y convivencia
  progresiva.
- [ADR-0003](adr/ADR-0003-CONTRATOS-DATOS-Y-ROLLBACK.md): contratos, datos y
  rollback.
- [Corte Angular 001](CORTE-ANGULAR-001-ESPACIO-CLINICO.md): base de Angular,
  sesión, paciente activo y lectura de la hoja clínica.

- [Corte Angular 002](CORTE-ANGULAR-002-ESTUDIOS-TIMELINE-ALTA.md): alta de
  paciente, estudios con persistencia y línea de tiempo Angular.
- [Corte Angular 003](CORTE-ANGULAR-003-HOSPITAL-DE-DIA-LECTURA.md): Hospital
  de Día Angular con tratamientos, ciclos, días, drogas, turnos y lectura de
  las colas operativas.
- [Corte Angular 004](CORTE-ANGULAR-004-TURNERO-LECTURA.md): agenda por sillón,
  lista de espera, filtros y lectura operativa Angular.
- [Corte Angular 005](CORTE-ANGULAR-005-PRESCRIPCION.md): recetas, certificados,
  solicitudes, texto libre y formularios sistémicos con permisos efectivos.
- [Corte Angular 006](CORTE-ANGULAR-006-AGENTE.md): Agente clínico, estado LLM,
  conversación segura, artefactos y navegación sobre la hoja.
- [Corte Angular 007](CORTE-ANGULAR-007-PROTOCOLOS.md): explorador de protocolos
  clínicos COIR/locales y referencia SEER*Rx con permisos efectivos.
- [Corte Angular 008](CORTE-ANGULAR-008-HERRAMIENTAS-GUIAS-TNM.md): biblioteca
  de Guías PDF y estadificación AJCC/TNM nativas, con las 57 calculadoras
  registradas como deuda de transición.
- [Corte Angular 009](CORTE-ANGULAR-009-BASE-CALCULADORAS.md): inventario
  estricto de 57 herramientas, motor seguro, catálogo operativo y primer lote
  BSA/IMC/Calvert con pruebas doradas; todavía sin habilitar una interfaz parcial.
- [Corte Angular 010](CORTE-ANGULAR-010-ESCALAS-FUNCIONALES-GERIATRICAS.md):
  ECOG/Karnofsky, Charlson, G8/CARG e IPSS/SHIM portados con campos
  condicionales, formularios inicialmente vacíos y límites clínicos comparados.

- [Corte Angular 011](CORTE-ANGULAR-011-RIESGO-PROSTATICO.md): riesgo
  prostático EAU, CAPRA/CAPRA-S, Partin y Roach portados con escenarios,
  referencias oficiales seguras y fronteras clínicas verificadas.

## Ciclo obligatorio por capacidad

1. Caracterizar el comportamiento vigente.
2. Incorporar o identificar pruebas que lo demuestren.
3. Implementar la nueva estructura.
4. Comparar API, persistencia, permisos e interfaz.
5. Corregir diferencias.
6. Actualizar OpenAPI y documentación.
7. Registrar un commit local verificable.
8. Publicar únicamente al completar el producto y su auditoría final.

## Reglas de seguridad de la migración

- La base PostgreSQL existente es la autoridad operacional.
- Flyway es el único mecanismo autorizado para modificar el esquema.
- Las migraciones serán aditivas mientras convivan ambas interfaces.
- No se elimina una ruta, tabla o campo sin demostrar que dejó de tener
  consumidores.
- El dominio no dependerá de Spring MVC, JDBC, JSON ni archivos.
- La interfaz Angular no implementará reglas clínicas que pertenezcan al
  servidor.
- `main` y la instancia estable del puerto 5180 no se utilizan para pruebas de
  la migración.
- La validación local usa el puerto 5181 y recursos Docker con prefijo
  `hcop_ajp_validation`.
- La imagen publicada para probar esta rama usa la etiqueta
  `angular-hexagonal-migration` y recursos persistentes `hcop_ajp_*`; nunca
  reemplaza `latest` ni los volúmenes estables.
