# Corte final de entrada Angular

## Resultado

HCOP JP tiene una sola interfaz operativa. Spring Boot sirve el build Angular
desde `/app/` y las rutas de entrada públicas conducen a esa aplicación. No se
usa iframe y Angular no carga ni ejecuta `src/main/resources/static/app.js`.

| Dirección recibida | Destino |
|---|---|
| `/`, `/index.html`, `/app` | `/app/` |
| `/configuration`, `/configuration/`, `/configuration/index.html` | `/app/#/configuration` |
| `/protocol-admin`, `/protocol-admin/`, `/protocol-admin/index.html` | `/app/#/configuration?tab=protocols` |
| `/herramientas`, `/herramientas/`, `/herramientas/index.html` | `/app/#/herramientas` |
| `/app/` | `forward:/app/index.html` |

El alias de Herramientas entra al shell Angular y selecciona esa solapa; su
contenido queda sujeto a los permisos efectivos del usuario. Los archivos
anteriores pueden permanecer temporalmente en el repositorio como referencia
visual y funcional. Maven los excluye expresamente del artefacto: el contenedor
no publica su HTML ni su JavaScript. Sólo conserva los estilos y activos que
forman el contrato visual, la documentación navegable y las dependencias de
terceros requeridas por Angular.

## Rutas que no intercepta el frontend

- `/api/**`: API de aplicación y autenticación;
- `/swagger-ui.html`: explorador Swagger;
- `/v3/api-docs` y sus grupos: contrato OpenAPI;
- `/actuator/**`: salud y métricas;
- `/docs/`: documentación HTML navegable;
- `/api/media/**`: archivos clínicos autorizados.

## Arquitectura de ejecución

```text
Navegador
  └─ Angular nativo
       └─ HTTP /api/**
            └─ Spring MVC
                 ├─ casos de uso y puertos hexagonales
                 ├─ repositorios JDBC
                 ├─ PostgreSQL + Flyway
                 └─ almacenamiento clínico persistente
```

Docker construye Angular con Node, copia su salida a
`src/main/resources/static/app` durante la imagen multietapa y empaqueta todo
en el `.jar` de Spring Boot. El contenedor final no necesita Node.js ni un
servidor web separado.

## Evidencia del corte

- `WebConfigurationRoutingTest` fija el contrato de entrada y demuestra que no
  captura API, Swagger, OpenAPI, Actuator ni documentación.
- `scripts/smoke-test.ps1` exige `<app-root>` en la raíz, `/app/` y todos los
  aliases históricos; además exige respuesta 404 para los ejecutables legacy.
- El empaquetado Maven excluye el HTML y JavaScript operativo anterior, y el
  Dockerfile inspecciona el `.jar` para impedir que reaparezcan por accidente.
- La construcción Angular debe aprobar antes de empaquetar Java.
- El smoke Docker debe verificar salud, login, catálogo, protocolos, rutas
  Angular y OpenAPI sobre una instancia real.

## Criterio para retirar archivos legacy

Eliminar del repositorio los archivos de referencia es un paso diferente al
retiro operativo, que ya está cerrado. Antes de borrarlos debe comprobarse que
Angular no importa CSS, imágenes, videos, catálogos o plantillas ubicados allí.
El JavaScript legacy queda fuera del `.jar` y no debe volver a enlazarse para
resolver una diferencia funcional.
