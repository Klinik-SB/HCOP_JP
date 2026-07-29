# Seguridad

## Implementado

- login obligatorio;
- BCrypt y compatibilidad de hash legado;
- sesión aleatoria almacenada como hash;
- cookie HttpOnly y SameSite Strict;
- permisos por rol;
- control optimista;
- auditoría clínica;
- QR firmado con HMAC;
- API key LLM cifrada con AES-GCM;
- validación de firmas de archivos;
- límites de tamaño y rutas normalizadas;
- proceso Docker no root;
- PostgreSQL sin puerto público.

## Secretos

`.env` contiene credenciales locales. No se versiona. Mantenga estable
`HCOP_ENCRYPTION_SECRET`: cambiarlo impide descifrar la API key guardada.

Nunca coloque:

- pacientes;
- backups;
- API keys;
- contraseñas reales;
- archivos clínicos

en GitHub.

## Producción

Antes de uso real:

- cambie contraseñas iniciales;
- publique solo detrás de HTTPS;
- configure backups;
- revise roles;
- limite firewall;
- rote cualquier clave que haya sido expuesta;
- valide normativa y consentimiento institucional.
