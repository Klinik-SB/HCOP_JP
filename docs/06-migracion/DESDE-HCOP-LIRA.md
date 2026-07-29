# Migración desde HCOP/Lira

## Resultado

HCOP JP ya no requiere dos servidores. La interfaz, la API Java, PostgreSQL,
catálogos, protocolos, guías, herramientas y archivos están en un único
producto desplegable.

## Qué se preservó

- estructura y aspecto de la interfaz;
- hoja clínica y formularios;
- diagnósticos y estadificación;
- tratamientos y detalle de ciclos;
- Hospital de Día, farmacia, sillones y QR;
- estudios, plantillas y anotación;
- herramientas, protocolos e investigación;
- compatibilidad de rutas necesarias.

## Qué no se publica

El repositorio y la imagen comienzan sin pacientes. Esta decisión evita exponer
datos clínicos en GitHub y coincide con la instalación limpia solicitada.

Una migración institucional debe ejecutarse localmente y verificar:

1. pacientes esperados/importados;
2. tratamientos por paciente;
3. ciclos y fechas;
4. archivos y hashes;
5. usuarios y roles;
6. recuentos antes/después.

La base temporal de desarrollo y los pacientes sintéticos de pruebas no se
copian a `C:\Proyectos\HCOP_JP` ni a GitHub.
