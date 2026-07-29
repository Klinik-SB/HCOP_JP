# Interoperabilidad

HCOP JP es autónomo. Las rutas con nombre `lira` son una capa de compatibilidad
para la interfaz histórica, pero leen PostgreSQL local.

## Contratos conservados

- `/api/lira/patients`: búsqueda local;
- `/api/lira/patients/{id}/preview`: previsualización local;
- `/api/lira/patients/{id}/import`: apertura local;
- `/api/lira/status`: confirma independencia;
- `/api/hc`: documento de historia activa.

Esto permite migrar el servidor sin reescribir de golpe la interfaz.

## Integraciones externas

El LLM es opcional y se configura con:

- proveedor OpenAI-compatible, LM Studio u Ollama;
- endpoint;
- modelo;
- API key cifrada;
- timeout, temperatura y límite de tokens.

La clave no aparece en la API ni en GitHub. El contenedor de aplicación tiene
salida a red; PostgreSQL permanece en una red Docker interna.
