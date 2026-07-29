# Acceso por red

La aplicación escucha en `0.0.0.0:5180` dentro del host. Desde otra PC de la
intranet:

```text
http://IP-DE-LA-PC:5180
```

Debe permitir TCP 5180 en el Firewall de Windows y mantener Docker Desktop
iniciado. No exponga PostgreSQL: Compose no publica su puerto.

Para Internet use un proxy HTTPS con certificado y control de acceso. No
publique directamente el puerto clínico sin TLS, backup y política de usuarios.

Si cambia el puerto, edite `.env`:

```text
HCOP_PORT=5181
HCOP_PUBLIC_BASE_URL=http://IP-DE-LA-PC:5181
```
