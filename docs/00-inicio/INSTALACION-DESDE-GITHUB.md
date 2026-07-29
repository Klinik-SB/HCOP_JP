# Instalación desde GitHub

## Opción recomendada: autoinstalador

1. Abra el repositorio `Marcolyto/HCOP_JP`.
2. Descargue `INSTALAR-DESDE-GITHUB.bat`.
3. Haga doble clic sobre el archivo descargado.
4. Si Docker Desktop no está instalado, el asistente intenta instalarlo con
   `winget`. Windows puede pedir permisos.
5. Docker Desktop puede solicitar activar WSL 2 o reiniciar la computadora. Si
   eso ocurre, reinicie y ejecute nuevamente el mismo instalador.
6. Ingrese usuario, contraseña y puerto. Puede presionar Enter para usar los
   valores sugeridos.
7. Espere a que se abra el navegador.

El programa se instala por defecto en:

```text
%LOCALAPPDATA%\HCOP_JP
```

En el Escritorio aparece un acceso directo **HCOP JP**.

## Qué hace el autoinstalador

- comprueba Docker Desktop;
- descarga el código más reciente desde GitHub;
- conserva cada versión en una carpeta separada;
- crea `.env` con contraseñas y secretos locales;
- descarga la imagen `ghcr.io/marcolyto/hcop_jp:latest`;
- crea PostgreSQL y sus tablas mediante Flyway;
- levanta la aplicación en el puerto elegido;
- crea el lanzador del Escritorio;
- abre el navegador.

Si la imagen todavía no está publicada, el instalador usa el código descargado
y construye la imagen localmente. El primer inicio demora más; los siguientes
son rápidos.

## Datos que se conservan al actualizar

Los datos no viven dentro de la carpeta de una versión. Docker los guarda en:

- `hcop_jp_postgres`: pacientes, tratamientos, turnos y configuración;
- `hcop_jp_storage`: estudios, imágenes y documentos.

Actualizar el código no borra esos volúmenes.

## Comprobar que funciona

Abra:

- `http://localhost:5180/actuator/health`: debe mostrar `UP`;
- `http://localhost:5180`: aplicación;
- `http://localhost:5180/swagger-ui.html`: API documentada.
