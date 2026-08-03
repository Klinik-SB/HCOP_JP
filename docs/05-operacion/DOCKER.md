# Docker

Docker ejecuta HCOP JP y PostgreSQL en dos contenedores coordinados. No necesita
instalar Java ni PostgreSQL en Windows.

## Componentes del despliegue

- **imagen**: programa empaquetado;
- **contenedor**: instancia que está ejecutándose;
- **volumen**: disco persistente;
- **compose**: archivo que inicia todo junto.

## Ejecución directa desde GitHub

Cuando Docker Desktop ya está instalado, copie y pegue esta línea completa en
Windows PowerShell:

```powershell
$hcopScript = Join-Path $env:TEMP "EJECUTAR-DOCKER-DESDE-GITHUB.ps1"; Invoke-WebRequest "https://raw.githubusercontent.com/Marcolyto/HCOP_JP/main/EJECUTAR-DOCKER-DESDE-GITHUB.ps1" -OutFile $hcopScript; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hcopScript
```

El lanzador mantiene `compose.yaml`, `.env` y los registros operativos en
`%LOCALAPPDATA%\HCOP_JP-Docker`. Conserva la base y los documentos entre
reinicios y actualizaciones.

En una base nueva también crea, por defecto, un paciente de ejemplo totalmente
sintético con un caso compuesto de colon y melanoma.
`HCOP_SEED_EXAMPLE_PATIENT=true` lo habilita y
`HCOP_SEED_EXAMPLE_PATIENT=false` lo desactiva. El arranque es idempotente: no
duplica la ficha ni la selecciona como paciente activo. Una versión nueva del
recurso sólo actualiza la hoja si conserva la revisión administrada; cualquier
edición humana la deja fuera de futuras actualizaciones automáticas. Cambiar a
`false` no borra una ficha ya creada. Consulte los detalles y ubicaciones de
`.env` en
[Instalación desde GitHub](../00-inicio/INSTALACION-DESDE-GITHUB.md#paciente-de-ejemplo-en-una-instalación-nueva).

El seed nunca bloquea el contenedor: una colisión de identidad, falta de actor
de auditoría o conflicto concurrente no resuelto registra una advertencia y
continúa sin crear o modificar el demo. La invalidez del recurso empaquetado es
un defecto que deben detectar las pruebas de release.

## Canal aislado de migración

La rama `codex/angular-full-parity-v2` se prueba sin reemplazar la versión
estable. Copie esta línea completa:

```powershell
$hcopScript = Join-Path $env:TEMP "EJECUTAR-DOCKER-DESDE-GITHUB.ps1"; Invoke-WebRequest "https://raw.githubusercontent.com/Marcolyto/HCOP_JP/codex/angular-full-parity-v2/EJECUTAR-DOCKER-DESDE-GITHUB.ps1" -OutFile $hcopScript; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hcopScript -Channel Migration
```

El canal usa:

- imagen `ghcr.io/marcolyto/hcop_jp:angular-full-parity-v2`;
- puerto elegido en el primer inicio; se sugiere 5181;
- proyecto Compose `hcop-ahjp`;
- base `hcop_ahjp`;
- volúmenes `hcop_ahjp_postgres` y `hcop_ahjp_storage`;
- carpeta `%LOCALAPPDATA%\HCOP_AHJP-Docker`.

El primer inicio solicita puerto, usuario administrador y contraseña. La
aplicación y Swagger quedan en `http://localhost:<puerto-elegido>` y
`http://localhost:<puerto-elegido>/swagger-ui.html`. La versión estable y el
canal migratorio anterior conservan sus propias carpetas, bases y volúmenes; sus
datos no se comparten. Consulte la
[guía de prueba de la rama](../00-inicio/PRUEBA-RAMA-ANGULAR-HEXAGONAL.md).

## Comandos desde un checkout del repositorio

Los comandos siguientes se ejecutan únicamente dentro de una copia local de
`HCOP_JP`, donde existen `compose.yaml` y `.env`. No sustituyen la línea de
ejecución directa anterior.

Iniciar:

```powershell
docker compose up --detach --wait
```

Ver estado:

```powershell
docker compose ps
```

Ver logs:

```powershell
docker compose logs --follow application
```

Detener conservando datos:

```powershell
docker compose down
```

No use `docker compose down --volumes` en una instalación con pacientes: esa
opción elimina la base.

## Archivos del proyecto

- `Dockerfile`: construye Java;
- `compose.yaml`: desarrollo/construcción local;
- `compose.github.yaml`: usa la imagen publicada;
- `.env`: secretos locales, nunca se sube a GitHub.

La interfaz Angular compilada también está dentro de esta misma aplicación:
Spring Boot la sirve desde el `.jar`. No hay que instalar ni levantar un segundo
frontend ni conservar una copia de `HCOP_lira`.
