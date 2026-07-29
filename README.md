# HCOP JP

HCOP JP reúne en un único sistema la historia clínica oncológica, diagnósticos,
prescripciones, protocolos, farmacia, Hospital de Día, turnero por sillón,
estudios, investigación, herramientas, usuarios y auditoría.

La interfaz conserva el producto HCOP/Lira construido hasta ahora. El servidor
fue migrado a Java 21 con Spring MVC y la persistencia a PostgreSQL. No necesita
Lira, Node.js ni MySQL para funcionar.

## Instalación más simple desde GitHub

Requisitos: Windows 10/11 de 64 bits, conexión a Internet y permisos para
instalar Docker Desktop.

1. Inicie sesión en GitHub con una cuenta autorizada y descargue
   [`INSTALAR-DESDE-GITHUB.bat`](INSTALAR-DESDE-GITHUB.bat).
2. Haga doble clic.
3. Acepte la instalación de Docker Desktop si Windows la solicita.
4. Elija usuario, contraseña y puerto o presione Enter para usar los valores
   sugeridos.
5. El instalador abre `http://localhost:5180`.

Como el repositorio y la imagen son privados, el asistente puede instalar
GitHub CLI y abrir una autorización por navegador en el primer equipo. No pide
que copie ni pegue tokens.

El acceso directo **HCOP JP** del Escritorio sirve como lanzador diario:
comprueba Docker, descarga la versión más reciente publicada en GitHub, mantiene
la base de datos y abre el sistema.

> Los pacientes y archivos clínicos nunca están en GitHub ni dentro de la
> imagen. Se conservan en volúmenes Docker locales.

## Prueba manual si ya tiene Docker

```powershell
Copy-Item .env.example .env
docker compose up --build --detach --wait
```

Luego abra:

- Aplicación: <http://localhost:5180>
- Swagger: <http://localhost:5180/swagger-ui.html>
- Salud: <http://localhost:5180/actuator/health>

Los valores iniciales de desarrollo son `marcolyto` / `colarse2`. El
autoinstalador permite cambiarlos y genera claves aleatorias.

## Arquitectura

HCOP JP es un monolito modular con separación MVC:

- `controller`: contrato HTTP y autorización;
- `service`: reglas clínicas, validaciones y transacciones;
- `repository`: consultas parametrizadas a PostgreSQL;
- `static`: interfaz web existente;
- `db/migration`: creación y evolución reproducible de la base.

Cada cambio de estructura usa Flyway. Las reglas de concurrencia críticas,
incluida la superposición de turnos, también están protegidas por PostgreSQL.

## Documentación

Empiece por el [índice de documentación](docs/README.md).

- [Instalar desde GitHub](docs/00-inicio/INSTALACION-DESDE-GITHUB.md)
- [Manual de uso](docs/01-uso/MANUAL-DE-USO.md)
- [Flujo clínico](docs/01-uso/FLUJO-TRATAMIENTO.md)
- [Arquitectura MVC](docs/02-arquitectura/MVC.md)
- [Swagger y API](docs/02-arquitectura/SWAGGER-OPENAPI.md)
- [Todos los endpoints](docs/02-arquitectura/ENDPOINTS.md)
- [Modelo de datos](docs/03-base-de-datos/MODELO-DE-DATOS.md)
- [Diccionario de datos](docs/03-base-de-datos/DICCIONARIO-DE-DATOS.md)
- [Mapa pantalla → API → base](docs/07-referencia/MAPA-FUNCIONAL.md)
- [Variables de entorno](docs/05-operacion/VARIABLES-DE-ENTORNO.md)
- [Crear el proyecto desde cero](docs/04-desarrollo/CREAR-DESDE-CERO.md)
- [Docker para principiantes](docs/05-operacion/DOCKER-PARA-PRINCIPIANTES.md)
- [Copias de seguridad](docs/05-operacion/BACKUP-Y-RESTAURACION.md)
- [Seguridad](docs/05-operacion/SEGURIDAD.md)

## Verificación

GitHub Actions compila Java, ejecuta pruebas y levanta el producto completo con
Docker y PostgreSQL. En una instalación local:

```powershell
.\scripts\integration-test.ps1
```

La prueba recorre login, paciente, diagnóstico, tratamiento, turno, QR,
administración, hoja de tratamiento y evoluciones.
