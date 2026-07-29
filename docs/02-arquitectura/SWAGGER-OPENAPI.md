# Swagger / OpenAPI

La documentación interactiva está en:

```text
http://localhost:5180/swagger-ui.html
```

La especificación se ofrece en:

```text
http://localhost:5180/v3/api-docs
http://localhost:5180/v3/api-docs.yaml
```

Swagger agrupa:

- API completa;
- clínica y Hospital de Día;
- administración y configuración.

Cada operación informa:

- resumen y finalidad;
- módulo;
- parámetros y cuerpos inferidos de Java;
- respuestas;
- seguridad por cookie;
- controlador MVC responsable.

## Probar una ruta

1. Inicie sesión en HCOP JP en otra pestaña del mismo navegador.
2. Abra Swagger.
3. Seleccione el grupo.
4. Abra una operación.
5. Pulse **Try it out** y luego **Execute**.

La cookie `HCOP_SESSION` es HttpOnly: Swagger no la lee ni la muestra; el
navegador la envía por ser el mismo origen.

## Regla de mantenimiento

Todo nuevo endpoint debe tener:

- permiso explícito;
- descripción en `OpenApiConfiguration`;
- prueba de éxito y de autorización;
- modelo de datos documentado;
- ausencia de secretos o datos clínicos en ejemplos.
