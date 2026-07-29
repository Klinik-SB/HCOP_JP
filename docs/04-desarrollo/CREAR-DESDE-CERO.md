# Crear HCOP JP desde cero

Esta es la versión resumida. Para una reconstrucción completa, con decisiones,
seguridad, migración, pruebas, Docker y checklist de aceptación, use el
[manual de reconstrucción con buenas prácticas](../08-recrear-desde-cero/README.md).

## 1. Herramientas

- Java 21;
- Maven 3.9 o superior;
- Docker Desktop;
- Git.

## 2. Crear el backend

Genere Spring Boot con:

- Spring Web MVC;
- JDBC;
- Validation;
- Actuator;
- Flyway;
- PostgreSQL;
- Spring Security Crypto;
- springdoc OpenAPI MVC.

Use paquetes por dominio, no carpetas globales con todos los controladores o
repositorios.

## 3. Crear la base

No cree tablas desde Java. Agregue migraciones inmutables:

```text
src/main/resources/db/migration/V001__core_schema.sql
V002__rbac_seed.sql
...
```

Nunca modifique una migración aplicada. Cree la siguiente.

## 4. Incorporar la interfaz

Ubique HTML, CSS, JS e imágenes en:

```text
src/main/resources/static
```

Use rutas `/api/...` del mismo origen. No guarde pacientes en JavaScript,
archivos versionados ni `localStorage` como fuente clínica.

## 5. Implementar cada caso MVC

1. Defina request/response.
2. Controller: autentica y autoriza.
3. Service: valida y abre transacción.
4. Repository: ejecuta SQL parametrizado.
5. Agregue auditoría/evolución cuando sea acto clínico.
6. Documente la operación en Swagger.
7. Agregue prueba.

## 6. Empaquetar

```powershell
mvn verify
docker compose up --build --wait
```

El `Dockerfile` compila en una etapa Maven y ejecuta como usuario no root en una
imagen JRE separada.

## 7. Publicar

Un push a `main`:

- verifica Java;
- levanta PostgreSQL y la aplicación;
- publica `ghcr.io/marcolyto/hcop_jp:latest`.
