# 04 · Implementar seguridad y auditoría

## Modelo de amenaza mínimo

Proteja contra:

- acceso sin sesión;
- usuario deshabilitado;
- escalada de permisos desde la UI;
- robo/reutilización de cookies;
- fuerza bruta y contraseñas débiles;
- inyección SQL;
- traversal y carga de archivos falsos;
- exposición de PHI en logs;
- alteración o reutilización de QR;
- sobrescritura concurrente;
- secretos dentro de Git o imagen.

## Contraseñas

- hash BCrypt con coste actualizado;
- nunca cifrado reversible;
- nunca log;
- longitud mínima y bloqueo de contraseñas triviales;
- cambio de contraseña revoca otras sesiones;
- usuario inicial sólo para bootstrap y con cambio obligatorio en producción.

## Sesiones

La cookie:

- se llama `HCOP_SESSION`;
- es HttpOnly;
- usa SameSite=Strict;
- usa Secure detrás de HTTPS;
- contiene un token aleatorio de alta entropía;
- en base se guarda únicamente su hash;
- tiene vencimiento y última actividad;
- se revoca al cerrar sesión o desactivar usuario.

Paciente activo pertenece a la sesión, no a una variable global.

## Roles y permisos

Roles iniciales:

- Administrador;
- Médico oncólogo;
- Enfermería;
- Farmacia;
- Admisión.

Los permisos son capacidades granulares (`section.*`, `workflow.*`, `admin.*`).
Cada ruta protegida exige el permiso en servidor. Ocultar un botón mejora la
interfaz, pero no autoriza.

Pruebe siempre:

- sin cookie → `401`;
- cookie válida sin permiso → `403`;
- usuario deshabilitado → sesión rechazada;
- permiso concedido → caso normal.

## CSRF y mismo origen

SameSite=Strict reduce CSRF, pero para exposición con dominios o integraciones
evalúe token CSRF explícito. Mantenga UI y API en el mismo origen. No habilite
CORS global con `*`.

## Archivos

Al cargar:

- limite tamaño;
- permita una lista de formatos;
- valide MIME y firma binaria;
- genere nombre interno;
- normalice la ruta dentro de storage;
- calcule SHA-256;
- no sirva el directorio como estático;
- autorice cada descarga;
- permita borrado temporal sólo a la misma sesión mediante grant.

## Secretos

- variables de entorno o secret manager;
- claves QR y cifrado diferentes;
- API key LLM cifrada con AES-GCM;
- respuestas nunca devuelven la API key;
- `.env.example` sólo contiene placeholders;
- rotación y recuperación documentadas.

## QR clínico

El QR debe incluir identificadores mínimos, vencimiento/versión y firma HMAC.
No debe mostrar texto clínico sensible. Al escanear:

1. verificar firma;
2. resolver paciente/tratamiento/ciclo/turno;
3. comprobar permiso;
4. persistir hash y `operation_id` único;
5. agregar evolución;
6. devolver el contexto operativo.

## Auditoría frente a evolución

- **Auditoría:** quién cambió técnicamente qué, antes/después, cuándo y por qué.
- **Evolución:** explicación clínica legible del acto.

Una no reemplaza a la otra. Ambas se escriben en la transacción del acto. Evite
auditar secretos o el documento completo si basta un resumen estructurado.

## Transporte y red

- HTTPS obligatorio fuera de localhost/intranet controlada;
- PostgreSQL no se publica a Internet;
- acceso remoto mediante VPN o proxy inverso;
- firewall limitado;
- headers del proxy configurados;
- `HCOP_PUBLIC_BASE_URL` coincide con la URL real.

## Hito de aceptación

Realice una matriz rol × operación y demuestre que cada celda permitida funciona
y cada celda prohibida responde `403`. Revise que logs, Swagger, historial del
navegador y repositorio no contengan contraseñas, cookies, claves ni pacientes.
