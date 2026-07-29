# 00 · Principios, alcance y decisiones

## Objetivo del sistema

HCOP JP concentra historia clínica oncológica y Hospital de Día en una sola
aplicación. El producto debe poder funcionar sin Lira, Node.js ni MySQL. La
compatibilidad histórica se conserva sólo donde evita romper la interfaz o un
contrato útil.

## Principios obligatorios

### Una fuente canónica

PostgreSQL es la autoridad de identidad, seguridad y operación. La hoja clínica
JSONB es la autoridad narrativa. Los archivos binarios viven en almacenamiento
privado y PostgreSQL conserva sus metadatos y hash.

### Un único límite de seguridad

El navegador habla únicamente con la API Java del mismo origen. Java valida
sesión, permisos, entrada, estados y concurrencia antes de persistir.

### Inmutabilidad donde importa

Evoluciones, eventos de workflow, auditoría y versiones históricas se agregan;
no se reescriben para ocultar una decisión previa. Las correcciones se expresan
como un nuevo evento o una nueva versión.

### Integridad en profundidad

La UI previene errores comunes, el servicio aplica reglas clínicas y
PostgreSQL impone restricciones que deben resistir dos usuarios concurrentes.

### Privacidad por defecto

No se incluyen pacientes en Git, imágenes Docker, fixtures ni ejemplos. Los
logs evitan contenido clínico, cookies, contraseñas y claves.

### Cambios reproducibles

Todo cambio de base es una migración Flyway. Todo contrato HTTP aparece en
OpenAPI. Todo despliegue se construye desde el repositorio y se valida en CI.

## Límites de dominio

| Dominio | Responsabilidad |
|---|---|
| Autenticación | usuarios, sesiones y paciente activo |
| Administración | roles, permisos y política de acceso |
| Paciente | identidad y espacio de trabajo |
| Historia clínica | documento versionado y evoluciones |
| Diagnóstico | SNOMED, CIE-10, AJCC, TNM y estadio |
| Tratamiento | prescripción, protocolo, drogas y ciclos |
| Hospital de Día | logística, turnos, sillones y administración |
| Workflow | suspensión, continuidad y solicitudes |
| Configuración | protocolos, guías, cálculos, formularios y parámetros |
| Archivos | estudios, imágenes, plantillas y autorización de descarga |
| Integraciones | LLM opcional y cifrado de secretos |
| Operación | salud, métricas, Docker, backup y actualización |

## Decisiones iniciales

1. **Monolito modular:** un despliegue y una base, con paquetes por dominio.
2. **Spring MVC + JDBC:** contratos claros y SQL explícito para reglas
   relacionales críticas.
3. **PostgreSQL:** JSONB, transacciones, índices parciales y controles
   concurrentes.
4. **Interfaz estática integrada:** mismo origen, cookie única y sin CORS
   interno.
5. **Sesión de servidor:** cookie HttpOnly; no bearer token persistido en el
   navegador.
6. **Flyway:** migraciones inmutables; limpieza destructiva deshabilitada.
7. **OpenAPI generado:** Swagger deriva del código y se verifica en CI.
8. **Storage fuera del JAR:** los adjuntos sobreviven actualizaciones.

Si una decisión cambia, documente motivo, alternativas, consecuencias y plan de
migración con una ADR.

## Definición de terminado

Una función está terminada cuando:

- tiene caso normal y errores definidos;
- comprueba permiso en servidor;
- valida cuerpo y transiciones;
- persiste en una transacción coherente;
- maneja concurrencia si corresponde;
- registra auditoría/evolución cuando es acto clínico;
- aparece en Swagger;
- tiene pruebas;
- está explicada para usuario y mantenimiento;
- puede desplegarse y restaurarse sin pasos ocultos.
