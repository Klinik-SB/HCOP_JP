# Swagger / OpenAPI

Swagger es la documentación ejecutable de la API real. Se genera desde los
controladores Spring MVC, los modelos Java y los metadatos de
`OpenApiConfiguration`; no es un inventario mantenido por separado.

## Direcciones

```text
Interfaz:              http://localhost:5180/swagger-ui.html
API completa JSON:     http://localhost:5180/v3/api-docs/hcop-jp-completa
Clínica JSON:          http://localhost:5180/v3/api-docs/clinica
Administración JSON:   http://localhost:5180/v3/api-docs/administracion
API base JSON:         http://localhost:5180/v3/api-docs
API base YAML:         http://localhost:5180/v3/api-docs.yaml
```

Swagger agrupa:

- **HCOP JP · API completa:** todas las rutas `/api/**`;
- **Clínica y Hospital de Día:** historia, tratamientos, turnos y archivos;
- **Administración y configuración:** usuarios, roles, guías y configuración.

Cada operación informa:

- método, ruta, resumen y finalidad;
- módulo y controlador MVC responsable;
- parámetros y cuerpos inferidos de Java;
- respuestas normales y errores esperables;
- seguridad por cookie y permiso efectivo mediante `x-hcop-permission`;
- si la operación es pública o autenticada mediante
  `x-hcop-authentication`.

## Probar una ruta

1. Inicie sesión en HCOP JP en otra pestaña del mismo navegador.
2. Abra Swagger.
3. Seleccione el grupo.
4. Abra una operación.
5. Pulse **Try it out** y luego **Execute**.

La cookie `HCOP_SESSION` es HttpOnly: Swagger no la lee ni la muestra; el
navegador la envía por ser el mismo origen.

Para comenzar sin Swagger:

```http
POST /api/auth/login
Content-Type: application/json

{"username":"usuario","password":"contraseña"}
```

La respuesta establece la cookie. Las siguientes solicitudes deben conservarla.
No se envían contraseñas, claves del LLM ni el valor de la cookie en URLs.

## Catálogo legible y buscable

El archivo [ENDPOINTS.md](ENDPOINTS.md) y la página
`/docs/api-endpoints.html` se generan con:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-api-docs.ps1
```

HCOP JP debe estar iniciado. Para verificar sin sobrescribir:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-api-docs.ps1 -Check
```

El segundo comando es parte de la validación del repositorio y falla si se
agregó, eliminó o cambió un endpoint sin regenerar la referencia.

## Respuestas y errores

Las respuestas de éxito pueden ser un objeto, una lista, un archivo o un
documento imprimible según la operación. Los errores JSON siguen esta base:

```json
{
  "ok": false,
  "error": "Mensaje seguro para el usuario",
  "code": "codigo_opcional",
  "status": 409
}
```

| Estado | Significado |
|---|---|
| `400` | Parámetros, archivo o cuerpo inválidos. |
| `401` | Sesión ausente, vencida o revocada. |
| `403` | El usuario no tiene el permiso requerido. |
| `404` | El recurso no existe o no está disponible. |
| `409` | Revisión desactualizada, estado incompatible o superposición. |
| `500` | Error interno sin exposición de datos sensibles. |

Los cambios clínicos usan `revision` o `version` cuando existe riesgo de que dos
usuarios modifiquen simultáneamente el mismo recurso. Un `409` obliga a releer y
revisar, no a repetir ciegamente.

## Archivos

Las cargas usan `multipart/form-data`. Las descargas y documentos pueden
responder PDF, imagen o el tipo MIME original. El acceso continúa protegido por
sesión: conocer una ruta de archivo no evita la autorización.

## Regla de mantenimiento

Todo nuevo endpoint debe tener:

- permiso explícito;
- descripción en `OpenApiConfiguration`;
- parámetros, cuerpo y respuestas representados en OpenAPI;
- prueba de éxito, error y autorización;
- modelo de datos documentado;
- ausencia de secretos o datos clínicos reales en ejemplos;
- catálogo `ENDPOINTS.md` regenerado.

El detalle de convenciones está en
[Contratos y convenciones de API](../04-desarrollo/CONTRATOS-DE-API.md).
