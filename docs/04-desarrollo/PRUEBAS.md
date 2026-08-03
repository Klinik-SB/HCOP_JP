# Pruebas

## Compilación

```powershell
mvn verify
```

## Prueba integral

Con el sistema iniciado:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\integration-test.ps1
```

Valida:

- salud;
- autenticación;
- paciente e historia;
- diagnóstico;
- protocolo y duración;
- tratamiento y ciclos;
- Farmacia y reserva por componente;
- turno sin superposición;
- triaje PASS;
- preparación y liberación;
- QR firmado;
- administración multidroga interrumpida y reanudada;
- conservación de dosis parcial, reacción e historial al cerrar;
- administración finalizada;
- hoja imprimible;
- evoluciones persistidas.

La prueba genera pacientes sintéticos solo en la base donde se ejecuta. No la
ejecute sobre producción.

## Frontend Angular clínico

Desde `frontend`:

```powershell
npm test
npm run build
```

La suite pura cubre proyecciones, normalización del workspace, edición
estructurada de Motivo de consulta, Antecedentes de enfermedad actual,
Antecedentes personales y Conclusión / resumen, registro de borradores sin
contenido clínico, códigos de conflicto y comparación de revisiones. El helper
de Antecedentes personales contiene 14 casos y 104 aserciones sobre sus cuatro
campos, instantáneas, compatibilidad y límites. La compilación usa la
configuración de producción y aplica sus presupuestos de tamaño.

Las pruebas Java de `ClinicalChiefComplaintAuthority`,
`ClinicalCurrentIllnessAuthority` y `ClinicalSummaryPlanAuthority` demuestran
que actor, fecha, motivo y versiones provienen del servidor, que un cliente no
puede reescribir la cadena confirmada y que el valor legacy no textual se
conserva. El corte 037 incorpora la misma cobertura para
`ClinicalPersonalHistoryAuthority`. La validación focalizada final ejecutó 66
pruebas Java/Swagger sin fallos ni omisiones. El contrato MVC verifica que
`PUT /api/hc` devuelva el estado canónico con la nueva revisión y sin el
comando transitorio.

El recorrido concurrente y los editores migrados de la hoja se validan contra Java
y PostgreSQL reales en un entorno Docker efímero:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-clinical-conflict-e2e.ps1 -SkipInstall
```

El lanzador reserva `127.0.0.1:5182`, genera credenciales y secretos efímeros,
ejecuta dos sesiones Chrome independientes y elimina pacientes, contenedores,
redes y volúmenes tanto ante éxito como ante fallo. No reutiliza la base estable
ni la instancia QA ordinaria. Los recorridos de Conclusión / resumen y Motivo
de consulta verifican foco inicial, contención por teclado, ausencia de cierre
por fondo/Escape, retorno al disparador, bloqueo del contexto y auditoría
recuperada desde PostgreSQL. También interceptan un primer guardado con `503`
y comprueban que el diálogo y los valores editables permanezcan disponibles
para reintentar. Motivo de consulta agrega además un `VERSION_CONFLICT` real
con una segunda sesión.

El recorrido dedicado de **Antecedentes de enfermedad actual** aplica el mismo
arnés a primera carga, modificación con motivo, error transitorio, conflicto
concurrente, persistencia canónica y recuperación. El corte 036 cerró con los
cuatro recorridos Playwright aprobados contra Java y PostgreSQL efímeros; el
arnés eliminó luego paciente, contenedores, redes y volúmenes sintéticos.

El corte 037 agrega el formulario Angular nativo en dos columnas de
**Antecedentes personales** y una instantánea versionada de sus cuatro campos.
El arnés Docker aprobó los cinco recorridos Playwright, incluido el nuevo
conflicto concurrente, y eliminó luego pacientes, contenedores, redes y
volúmenes sintéticos.

En la aceptación final del 30/07/2026, la suite Java terminó con **101/101
pruebas aprobadas**. El E2E utilizó una aplicación de cuatro drogas, interrumpió
Carboplatino al 50 %, reanudó la administración y finalizó en `completed`
conservando dosis parcial, interrupción y reacción.

## Documentación y OpenAPI

Con HCOP JP iniciado:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-api-docs.ps1 -Check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-documentation.ps1
```

La primera orden comprueba que el catálogo de endpoints coincide exactamente
con Swagger. La segunda valida enlaces Markdown, páginas públicas, documentación
HTML y que cada operación OpenAPI tenga resumen, descripción, controlador y
permiso. Ambas se ejecutan también en GitHub Actions.

## Matriz de 100 casos de Hospital de día

Con una instancia QA aislada en `http://127.0.0.1:5181`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\qa\hospital-day-100-cases.ps1 `
  -BaseUrl http://127.0.0.1:5181
```

La última evidencia registró
[100 PASS, 0 FAIL, 0 NO_DATA y 0 MANUAL](../08-auditoria/resultados/hospital-dia-100-casos-20260730-100711.md).
Esta matriz es independiente de la prueba integral multidroga anterior.

## Docker en GitHub

El workflow `verify.yml` construye el producto, espera la salud y destruye sus
volúmenes temporales al finalizar.
