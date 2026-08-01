# Corte Angular 006: Agente clínico

## Alcance del corte

La solapa **Agente** queda gobernada por Angular y conserva la geometría,
tipografía, mensajes, sugerencias y compositor de la interfaz de referencia.
El corte incorpora:

- estado real del servicio LLM;
- conversación clínica de texto con historial acotado;
- sugerencias de resumen, tabla, gráfico y resaltado;
- render declarativo y seguro de tablas, gráficos y preguntas de seguimiento;
- navegación desde resultados hacia la hoja clínica;
- resaltado celeste o categorizado sin inyectar HTML;
- cancelación de respuestas al limpiar, cambiar de paciente o abandonar la solapa;
- mensajes específicos para servicio desactivado, timeout y falta de permisos;
- ocultamiento de la solapa sin `section.agent.view`.

La conversación continúa siendo deliberadamente efímera: no se almacena en la
historia ni en PostgreSQL. La configuración del proveedor, endpoint, modelo y
secreto sí se conserva mediante la configuración general existente.

## Contratos

- `GET /api/llm/status`: informa estado no sensible del proveedor.
- `POST /api/agent/chat`: recibe consulta, contexto clínico desidentificado e
  historial previo acotado.

Ambas rutas exigen `section.agent.view`. El servidor limita la consulta y cada
mensaje previo, usa sólo los últimos doce elementos útiles y elimina una copia
de la consulta actual si un cliente anterior la repite al final del historial.
Los campos históricos `timelineEvents` y `consultAgents` se aceptan para no
romper clientes, pero no activan comportamiento oculto.

`POST /api/agent/chat` tiene además dos barreras previas a Jackson: el permiso
se verifica antes de materializar el cuerpo y el JSON completo queda limitado
a 2 MiB aun cuando el cliente use transferencia sin longitud declarada. El
controlador repite el permiso como defensa adicional.

La respuesta mantiene `answer`, `model`, `artifacts`, `followUps` y
`highlights`. El servidor solicita JSON estructurado al proveedor, valida sus
límites y tipos y sólo entrega a Angular tablas, gráficos, sugerencias y
resaltados seguros. Si el proveedor devuelve texto plano o JSON incompleto, se
conserva una respuesta de texto compatible y las colecciones quedan vacías.

## Privacidad y cambios de contexto

Angular construye el contexto desde la ficha activa sin incluir el objeto de
identidad. Antes del envío elimina de forma recursiva los campos de paciente y
profesional, incluidos los formularios sistémicos, y redacta nombre, DNI, HC,
afiliado, contacto, domicilio y fecha de nacimiento. La misma redacción se
aplica a la consulta actual y al historial conversacional.

Cada solicitud queda ligada al paciente y revisión visibles al iniciarla. Una
respuesta atrasada se descarta si la historia cambió. Todo cambio de revisión
reinicia la conversación para no combinar mensajes basados en una versión vieja
con el contexto nuevo. Limpiar la conversación, cambiar/cerrar paciente o
desmontar la solapa cancela la suscripción y evita que un resultado anterior
reaparezca en otra ficha.

## Navegación y resaltado

`ClinicalFocusService` comunica el Agente con la hoja clínica. La hoja busca
primero una fecha exacta y luego términos clínicos normalizados, aplica las
clases visuales del contrato legacy y desplaza el registro al centro. Limpiar
el chat también retira los resaltados.

## Archivos principales

- `frontend/src/app/features/agent/agent.component.*`: interfaz y flujo.
- `frontend/src/app/features/agent/agent.service.ts`: cliente HTTP.
- `frontend/src/app/features/agent/agent.models.ts`: contratos estrictos.
- `frontend/src/app/core/clinical/clinical-focus.service.ts`: foco compartido.
- `src/main/java/ar/com/hexium/hcop/integration/LlmController.java`: límites y
  contrato del servidor.
- `src/main/java/ar/com/hexium/hcop/integration/AgentChatRequestSizeFilter.java`:
  límite previo a la deserialización.
- `src/main/java/ar/com/hexium/hcop/auth/AuthInterceptor.java`: autorización
  temprana del endpoint del Agente.
- `src/test/java/ar/com/hexium/hcop/integration/LlmControllerTest.java`:
  regresión de permisos, historial y respuestas.

## Criterios de validación

- build de producción Angular;
- pruebas Java enfocadas y suite completa;
- documentación OpenAPI completa y sin operaciones duplicadas;
- contenedor Docker saludable;
- login y acceso autorizado al Agente;
- solapa ausente para un usuario sin permiso;
- error claro con LLM desactivado;
- descarte de respuestas al cambiar de paciente o limpiar;
- comparación visual del panel con el contrato legacy.
