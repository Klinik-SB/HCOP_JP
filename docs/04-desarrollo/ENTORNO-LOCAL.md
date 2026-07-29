# Entorno local

## Con Docker

```powershell
Copy-Item .env.example .env
docker compose up --build --detach --wait
docker compose logs --follow application
```

## Sin Docker

Necesita PostgreSQL. Configure:

```text
HCOP_DB_URL=jdbc:postgresql://127.0.0.1:5432/hcop_jp
HCOP_DB_USER=hcop
HCOP_DB_PASSWORD=...
HCOP_RUNTIME_ROOT=./runtime
```

Luego:

```powershell
mvn spring-boot:run
```

Flyway aplica las migraciones automáticamente.

## Carpetas que no se versionan

- `.env`;
- `target`;
- `runtime/storage`;
- datos de PostgreSQL;
- logs y PID.

Los catálogos clínicos sí se versionan porque forman parte de la versión
funcional del producto.
