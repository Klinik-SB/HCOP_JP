# Migración Angular y arquitectura hexagonal

Esta carpeta gobierna la migración de HCOP JP. El objetivo es reemplazar el
frontend estático por Angular y evolucionar el backend hacia un monolito
modular hexagonal sin perder comportamiento, datos, permisos, documentación ni
capacidad de despliegue.

La versión operativa permanece disponible durante toda la transición. Cada
capacidad nueva se compara contra la línea base antes de habilitarse y el
frontend anterior sólo se retira cuando la matriz de paridad está completa.

La biblioteca declarativa Angular conserva el inventario completo y tiene
**57 de 57 calculadoras** portadas con pruebas doradas. Esto completa las
definiciones y reglas. El corte 023 agrega el primer renderizador Angular
visible, nativo y diferido; la capacidad seguirá `Pendiente` hasta aplicar la
configuración institucional y cerrar la paridad visual/E2E integrada.

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
- [Corte Angular 012](CORTE-ANGULAR-012-NOMOGRAMAS-Y-CINETICA-PROSTATICA.md):
  MSKCC, PBCG, cinética de PSA/BCR y CHAARTED/LATITUDE portados con
  escenarios, series temporales y salidas estructuradas seguras.
- [Corte Angular 013](CORTE-ANGULAR-013-UROTELIO-Y-APTITUD-PLATINO.md): NMIBC
  EAU/EORTC/CUETO, post-cistectomía, aptitud para cisplatino/platinum y UTUC
  portados con cohortes, fronteras y limitaciones heredadas verificadas.
- [Corte Angular 014](CORTE-ANGULAR-014-RENAL-Y-TESTICULO.md): RENAL/PADUA,
  Leibovich/UISS, IMDC e IGCCCG portados con escenarios, límites anatómicos,
  grupos pronósticos y limitaciones heredadas verificadas.
- [Corte Angular 015](CORTE-ANGULAR-015-FUNCION-RENAL-Y-RIESGO-AGUDO.md):
  Cockcroft–Gault/CKD-EPI, ANC/CTCAE, Khorana y MASCC portados con unidades,
  fronteras clínicas y defectos heredados explícitos.
- [Corte Angular 016](CORTE-ANGULAR-016-RIESGO-PALIATIVOS-Y-RADIOTERAPIA.md):
  CISNE, PPI, BED/EQD2 y QTc Fridericia portados con clases, equivalencia
  biológica, referencias y redondeos heredados verificados.
- [Corte Angular 017](CORTE-ANGULAR-017-MAMA-PRONOSTICO-Y-RESPUESTA.md): NPI,
  RCB experimental, PEPI y CTS5 portados con fronteras, limitaciones clínicas,
  defectos heredados y enlace oficial tipado verificados.
- [Corte Angular 018](CORTE-ANGULAR-018-ENSAYOS-MAMA-Y-HEMATOLOGIA.md):
  monarchE cohorte 1, OlympiA/CPS+EG, IPI y R2-ISS portados con escenarios,
  fronteras, limitaciones y defectos heredados verificados.
- [Corte Angular 019](CORTE-ANGULAR-019-GINECOLOGIA-SEDRIS-PETERS-PROMISE-RMI.md):
  Sedlis, Peters, ProMisE/ESGO y RMI I portados con aplicabilidad dinámica,
  jerarquía molecular, umbrales y defectos heredados verificados.
- [Corte Angular 020](CORTE-ANGULAR-020-GINECOLOGIA-OVARIO-Y-NODULO-PULMONAR.md):
  Fagotti, AGO/DESKTOP III, Brock/PanCan y Mayo-Herder portados con fórmulas,
  fronteras, advertencias y limitaciones heredadas verificadas.
- [Corte Angular 021](CORTE-ANGULAR-021-GPA-LIPI-ALBI-AFP-HCC.md):
  Lung GPA 2022, LIPI, ALBI/mALBI y AFP francés HCC portados con tablas,
  conversiones, tolerancias y defectos de grilla heredados verificados.
- [Corte Angular 022](CORTE-ANGULAR-022-GAME-PCI-Y-RADIOTERAPIA.md): GAME,
  PCI y las cuatro herramientas de radioterapia completan las 57 definiciones,
  con ecuaciones LQ, enumeración SIB y tablas tipadas verificadas.
- [Corte Angular 023](CORTE-ANGULAR-023-RENDERIZADOR-CALCULADORAS.md):
  renderizador Angular nativo de las 57 herramientas, con carga diferida,
  permisos efectivos, formulario tipado y salidas estructuradas sin iframe.
- [Corte Angular 024](CORTE-ANGULAR-024-CATALOGO-Y-MOTOR-CONFIGURABLE.md):
  catálogo institucional aislado, merge seguro de built-ins y motor TypeScript
  de fórmulas/scores comparado contra los dos motores legacy reales.
- [Corte Angular 025](CORTE-ANGULAR-025-FACTORY-INSTITUCIONAL.md): traducción
  tipada de fórmulas y scores validados al contrato visual de calculadoras,
  todavía aislada del workspace hasta completar la validación atómica.

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
