# Corte Angular 033: conflicto concurrente con dos sesiones reales

Fecha: 2026-08-02
Estado: implementado y validado localmente; no publicado

## Objetivo

Demostrar en navegador y contra PostgreSQL real que dos sesiones pueden abrir
la misma revisión de una historia, que la primera escritura válida gana y que
la segunda recibe `409 VERSION_CONFLICT` sin perder su borrador ni sobrescribir
el documento confirmado.

## Recorrido automatizado

La prueba abre dos contextos Chrome independientes con cookies separadas y usa
exclusivamente un paciente sintético:

1. ambas sesiones cargan el mismo paciente y la misma revisión;
2. la sesión B registra una indicación libre y obtiene la revisión siguiente;
3. la sesión A intenta guardar desde la revisión anterior y recibe
   `VERSION_CONFLICT`;
4. Angular mantiene visible el borrador A y bloquea alta, apertura de otro
   paciente y cierre de sesión;
5. la comparación muestra borrador y cambio ganador sin emitir otro `PUT`;
6. cancelar el descarte conserva el borrador;
7. confirmar el descarte relee el servidor y muestra solamente el cambio B;
8. una respuesta comparativa demorada no reinstala el conflicto descartado;
9. una lectura final comprueba que PostgreSQL contiene el cambio ganador, una
   sola revisión adicional y ninguna parte del intento A.

## Aislamiento

`compose.e2e.yaml` define una aplicación, una base, dos volúmenes y dos redes
con un proyecto único por ejecución cuyo prefijo es
`hcop-ajp-conflict-e2e-`. La imagen usa la etiqueta exclusiva
`hcop-jp-conflict-e2e:local`. El puerto predeterminado es `5182`, se publica
sólo en `127.0.0.1` y queda separado de la instancia estable y de la validación
ordinaria. El lanzador genera secretos efímeros, espera salud HTTP y ejecuta el
navegador.

El bloque `finally` destruye contenedores, redes, almacenamiento y base aun si
la prueba falla, y el comando informa como error una limpieza incompleta. No se
usan pacientes, credenciales ni volúmenes existentes.
Capturas y traza se conservan únicamente ante fallo bajo una ruta ignorada por
Git.

## Ejecución

Desde la raíz del repositorio:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-clinical-conflict-e2e.ps1
```

Para reutilizar una imagen local y dependencias ya preparadas:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-clinical-conflict-e2e.ps1 -SkipBuild -SkipInstall
```

Puede elegirse otro puerto mediante `-Port`. Si Chrome no está registrado como
canal estable, `HCOP_E2E_BROWSER_PATH` permite indicar un ejecutable compatible
sin descargar un navegador en el repositorio.

## Evidencia

- `48` casos y `146` aserciones clínicas Angular correctas.
- compilación Angular de producción correcta;
- definición Compose y sintaxis del lanzador correctas;
- E2E real: `1` recorrido concurrente aprobado en Chrome;
- PostgreSQL efímero creado y eliminado por la misma ejecución;
- sin escrituras durante comparación, actualización o cierre del diálogo;
- protección comprobada frente a respuesta tardía y descarte cancelado.

## Estado de paridad

Este corte cierra la deuda E2E de concurrencia indicada en los cortes 031 y
032. La fila **Hoja clínica** continúa `Pendiente`: todavía faltan los
formularios de edición equivalentes a legacy y una resolución humana explícita
por registro; no se implementa mezcla automática.

## Próximo corte seguro

Migrar un único editor narrativo de la hoja —preferentemente Motivo de consulta
o Conclusión / resumen— con estado sucio, motivo de modificación, auditoría,
versiones, validación de servidor y este mismo E2E como red de seguridad.
