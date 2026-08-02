# Corte Angular 031: conflictos de guardado sin pérdida silenciosa

Fecha: 2026-08-02
Estado: implementado y validado localmente; no publicado

## Objetivo

Evitar que dos ventanas o usuarios sobrescriban una historia clínica y que la
interfaz pierda el borrador cuando PostgreSQL rechaza una revisión vencida.

## Contrato Java

`PUT /api/hc` mantiene HTTP `409`, pero ahora entrega un código estable según la
causa:

| Código | Significado |
|---|---|
| `ACTIVE_PATIENT_REQUIRED` | La sesión no tiene un paciente activo. |
| `CLINICAL_REVISION_REQUIRED` | El documento no informó una revisión válida. |
| `CLINICAL_PATIENT_MISMATCH` | La identidad interna del documento no coincide con el paciente activo. |
| `VERSION_CONFLICT` | Otra escritura ya avanzó la revisión en PostgreSQL. |

Los mensajes siguen siendo seguros para mostrar al usuario. Angular decide por
`code`; nunca interpreta el texto para inferir una colisión.

## Política Angular

Ante cualquier respuesta HTTP `409`:

1. conserva copias profundas del estado base y del intento;
2. mantiene intacto el workspace confirmado por el servidor;
3. proyecta el borrador únicamente cuando continúa abierto el mismo paciente;
4. muestra un aviso persistente y bloquea nuevos guardados;
5. bloquea imprimir, cerrar/cambiar paciente, salir al frontend legacy y cerrar
   sesión mientras el borrador esté pendiente;
6. permite una única resolución segura en este corte: descartar el borrador y
   recargar la última revisión.

Un documento con `CLINICAL_PATIENT_MISMATCH` queda en cuarentena y no se
proyecta bajo la identidad visible. Las transiciones de paciente y un segundo
guardado se bloquean en el servicio, no sólo mediante botones. La navegación
SPA y el cierre de pestaña también quedan protegidos.
La misma protección se activa durante el breve intervalo de un `PUT` en curso,
antes de conocer si el servidor lo confirmó o lo rechazó.

`VERSION_CONFLICT` se reconoce por código. Un `409` sin código queda como
`UNKNOWN_CLINICAL_CONFLICT` y también conserva el borrador, sin suponer la
causa. No hay reintento, incremento de revisión ni mezcla automática. Estudios impide
subir o eliminar más archivos durante el conflicto y mantiene visible el
registro que no alcanzó a vincularse a la historia.

## Persistencia y límites

El borrador sólo vive en memoria dentro de la pestaña actual. No se escribe en
`localStorage` ni en otro almacenamiento del navegador para evitar persistir
información clínica fuera del backend. Un cierre forzado del proceso aún puede
perderlo; una bandeja cifrada de recuperación requerirá una decisión de
seguridad y un contrato propio.

Este corte no implementa merge de campos ni habilita edición general de la hoja
clínica. La matriz continúa marcando esa capacidad como pendiente.

## Evidencia

- Angular: `37` casos y `104` aserciones.
- Compilación de producción Angular: correcta.
- Java: `9` pruebas enfocadas correctas, incluidas las cuatro respuestas HTTP
  `409` y permisos preexistentes.
- El test contractual verifica que identidad/revisión inválidas no ejecutan
  `UPDATE` y que un CAS vencido no sobrescribe la versión ganadora.

## Próximo corte seguro

Diseñar la comparación explícita entre revisión vigente y borrador. Cualquier
merge deberá operar por campos y registros identificados, mostrar diferencias
y exigir confirmación humana; nunca debe existir una acción genérica de
“sobrescribir todo”.
