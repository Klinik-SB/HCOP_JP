# Corte Angular 032: comparación segura de conflictos clínicos

Fecha: 2026-08-02
Estado: implementado y validado localmente; no publicado

## Objetivo

Permitir que una persona comprenda un `VERSION_CONFLICT` antes de descartar su
borrador, sin activar otro paciente, sustituir el workspace visible, mezclar
estados ni enviar una nueva escritura.

## Flujo visible

El aviso de cambios sin guardar ofrece **Comparar cambios** solamente cuando el
servidor identificó `VERSION_CONFLICT`. El diálogo muestra valores acotados por
campo o registro:

- qué cambió en el borrador respecto de su revisión base;
- qué cambió en la última revisión confirmada respecto de esa misma base;
- qué campos fueron modificados por ambos y requieren revisión humana.

No se presentan acciones de fusionar, reintentar ni sobrescribir. Cerrar el
diálogo conserva el borrador. **Descartar borrador y recuperar historia** sigue
siendo una acción separada, confirmada y con una lectura nueva del servidor.

## Aislamiento y carreras

Cada conflicto posee un `conflictId` efímero. La lectura comparativa usa un GET
independiente y no reutiliza `load()`, por lo que nunca cambia el paciente
activo ni el `workspace` confirmado. Una respuesta sólo se acepta cuando
coinciden:

1. `conflictId`;
2. paciente;
3. revisión base;
4. secuencia de solicitud;
5. una revisión del servidor posterior a la base y no anterior al workspace ya visible.

Respuestas tardías, otro paciente, una revisión inválida o un conflicto ya
descartado se ignoran. Una recarga normal del mismo paciente invalida también
la lectura comparativa en curso. Los estados base, borrador y último se
mantienen como copias profundas en memoria; el componente sólo recibe filas
sanitizadas, con etiquetas humanas y valores truncados, nunca el JSON crudo.

El comparador se memoiza y sólo está disponible mientras la sesión conserva el
permiso de lectura de Historia. Un `401` o `403` retira de inmediato el snapshot
comparativo. El foco entra al diálogo y vuelve al control de origen al cerrarlo.

El `GET /api/clinical/patients/{id}/workspace` ahora responde
`Cache-Control: no-store` y `Pragma: no-cache`. Esto evita que una comparación
clínica dependa de una copia HTTP almacenada.

## Alcance de la comparación

La comparación es conservadora. Las colecciones con identificadores únicos se
alinean por identidad estable y el reordenamiento no crea cambios falsos. Una
colección sin identidad confiable se compara atómicamente; nunca se alinean
registros por posición ni se inventan identidades. También se incluyen metadatos
y campos superiores desconocidos, salvo `meta.persistenceRevision`, que es un
dato de transporte y no un cambio clínico.

Esto no constituye un merge. La fila **Hoja clínica** continúa pendiente hasta
completar edición, resolución humana por registro y el E2E concurrente con dos
sesiones reales.

## Evidencia

- Angular: `48` casos y `146` aserciones correctas.
- Comparador: `10` casos y `37` aserciones, incluidos paciente incorrecto,
  revisión vencida, solicitud tardía, conflicto reemplazado, reordenamiento,
  valores acotados y metadatos técnicos.
- Compilación de producción Angular: correcta.
- Java: pruebas enfocadas de permisos, revisión y cabeceras HTTP correctas.
- El workspace visible no participa de la lectura comparativa.
- Smoke Docker sobre PostgreSQL vacío: salud, autenticación, núcleo clínico,
  configuración y OpenAPI correctos; recursos temporales eliminados al finalizar.

## Próximo corte seguro

Caracterizar y migrar un recorrido pequeño de edición de la hoja con su
persistencia, validación y conflicto, o completar el E2E concurrente de dos
sesiones antes de diseñar cualquier merge.
