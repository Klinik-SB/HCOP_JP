# 01 · Inicializar el proyecto

## Herramientas

- Git;
- JDK 21;
- Maven 3.9 o superior;
- Docker Desktop con Compose v2;
- editor con soporte Java, SQL, HTML, CSS y JavaScript;
- PowerShell 5.1+ en Windows o PowerShell 7 para scripts multiplataforma.

Compruebe:

```powershell
java -version
mvn -version
docker version
docker compose version
git --version
```

## Crear el repositorio

```powershell
New-Item -ItemType Directory HCOP_JP
Set-Location HCOP_JP
git init
```

Use `main` protegida y ramas cortas para cambios. No versionar:

- `.env`;
- `target`;
- `runtime/storage`;
- dumps PostgreSQL;
- claves y certificados privados;
- archivos clínicos;
- configuración personal del IDE.

## Generar Spring Boot

Coordenadas:

```text
group: ar.com.hexium
artifact: hcop-jp
java: 21
packaging: jar
```

Dependencias mínimas:

- Spring Web MVC;
- Spring JDBC;
- Validation;
- Actuator;
- Flyway y soporte PostgreSQL;
- driver PostgreSQL;
- Spring Security Crypto;
- Springdoc OpenAPI MVC UI;
- Spring Boot Test;
- Testcontainers PostgreSQL.

El [pom.xml actual](../../pom.xml) fija las versiones probadas. Cuando se
actualice una dependencia:

1. leer notas de migración;
2. cambiar una familia por vez;
3. ejecutar compilación, pruebas y Docker;
4. revisar OpenAPI;
5. registrar el cambio.

## Estructura inicial

```text
src/
  main/
    java/ar/com/hexium/hcop/
      auth/
      admin/
      patient/
      diagnosis/
      treatment/
      infusion/
      workflow/
      qr/
      configuration/
      catalog/
      media/
      integration/
      system/
      common/
      config/
    resources/
      application.yml
      db/migration/
      static/
  test/
    java/ar/com/hexium/hcop/
docs/
scripts/
.github/workflows/
```

Organice por dominio, no en carpetas globales gigantes como `controllers/`,
`services/` y `repositories/`. Dentro de cada dominio puede coexistir su
Controller, Service y Repository.

## Configuración externa

`application.yml` contiene valores seguros de desarrollo y referencias a
variables; no secretos reales. Defina desde el comienzo:

- puerto y dirección;
- JDBC y pool;
- rutas de runtime, catálogos y storage;
- duración/cookie de sesión;
- límites de carga;
- secretos QR y cifrado;
- Actuator y Springdoc.

Use la lista vigente de
[variables de entorno](../05-operacion/VARIABLES-DE-ENTORNO.md).

## Primer hito

Antes de crear dominios clínicos debe pasar:

```powershell
mvn --batch-mode verify
```

Y debe responder:

```text
GET /actuator/health → UP
GET /swagger-ui.html → interfaz Swagger
```

No agregue funciones clínicas hasta que el esqueleto pueda construirse tanto
localmente como en un contenedor.
