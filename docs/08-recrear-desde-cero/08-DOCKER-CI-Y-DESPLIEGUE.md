# 08 · Preparar Docker, CI y despliegue

## Dockerfile multi-stage

Etapa de build:

- imagen Maven/JDK fijada;
- copia primero `pom.xml`;
- cache de dependencias;
- copia `src`;
- empaqueta JAR.

Etapa runtime:

- JRE 21, no JDK/Maven;
- usuario no root;
- sólo JAR y catálogos necesarios;
- directorio storage con propietario correcto;
- healthcheck;
- límites de memoria;
- entrada `java -jar`.

No copie `.git`, `.env`, dumps, pacientes, storage local ni `target` del host.
Mantenga `.dockerignore`.

## Docker Compose

Servicios:

- `database`: PostgreSQL 18.4, red interna, volumen persistente y healthcheck;
- `application`: depende de DB saludable, publica sólo HTTP, monta storage.

Volúmenes separados:

```text
hcop_jp_postgres
hcop_jp_storage
```

No monte el código fuente en producción. No publique el puerto 5432 salvo una
necesidad administrativa temporal y restringida.

## Configuración

Use `.env` fuera de Git:

```dotenv
HCOP_PORT=5180
HCOP_DB_NAME=hcop_jp
HCOP_DB_USER=hcop
HCOP_DB_PASSWORD=<secreto>
HCOP_BOOTSTRAP_USERNAME=<administrador>
HCOP_BOOTSTRAP_PASSWORD=<secreto-inicial>
HCOP_QR_SECRET=<aleatorio>
HCOP_ENCRYPTION_SECRET=<aleatorio-distinto>
HCOP_PUBLIC_BASE_URL=https://hcop.example
```

En producción, los placeholders débiles deben causar una advertencia o rechazo.

## Health y readiness

El contenedor se considera listo cuando:

- Java inició;
- datasource responde;
- Flyway terminó;
- `/actuator/health` devuelve `UP`.

Compose espera esa condición antes de pruebas o exposición.

## GitHub Actions

Use dos workflows:

### Verificación

- Maven verify;
- Docker Compose integral;
- documentación;
- flujo clínico;
- teardown siempre.

### Publicación

- login a GHCR con `GITHUB_TOKEN`;
- metadata/tag;
- build multi-architecture si se necesita;
- cache BuildKit;
- push sólo desde ramas/tags autorizados;
- digest visible.

Evite publicar una imagen si la verificación no pasó. Para endurecer, haga que
publicación dependa del workflow exitoso o aplique reglas de protección.

## Versionado

- versión de aplicación en Maven;
- tag Git para releases;
- etiqueta OCI;
- imagen `:version`;
- `:latest` sólo como alias cómodo;
- digest para despliegues reproducibles.

## Actualización segura

1. backup de base y storage;
2. descargar imagen por versión;
3. revisar migraciones;
4. iniciar;
5. esperar health;
6. ejecutar smoke test;
7. conservar imagen anterior;
8. rollback de aplicación sólo si el esquema sigue siendo compatible.

No “retroceda” una base aplicando SQL inverso improvisado. Diseñe migraciones
compatibles por etapas para cambios grandes.

## Observabilidad

Mínimo:

- health/readiness;
- métricas JVM, pool y HTTP;
- logs estructurados con request ID;
- alertas por errores, pool agotado y storage;
- rotación/retención;
- sin PHI ni secretos.

## Hito de aceptación

Una máquina sin Java/Maven, pero con Docker, debe poder iniciar:

```powershell
docker compose up --build --detach --wait
```

Los datos deben sobrevivir a `docker compose down` y actualización de imagen.
Sólo `down --volumes` elimina el entorno de prueba.
