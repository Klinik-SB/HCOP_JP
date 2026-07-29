# Docker para principiantes

Docker ejecuta HCOP JP y PostgreSQL en dos contenedores coordinados. No necesita
instalar Java ni PostgreSQL en Windows.

## Conceptos mínimos

- **imagen**: programa empaquetado;
- **contenedor**: instancia que está ejecutándose;
- **volumen**: disco persistente;
- **compose**: archivo que inicia todo junto.

## Comandos

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
