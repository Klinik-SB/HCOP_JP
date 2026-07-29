# Pruebas

## Compilación

```powershell
mvn verify
```

## Prueba integral

Con el sistema iniciado:

```powershell
.\scripts\integration-test.ps1
```

Valida:

- salud;
- autenticación;
- paciente e historia;
- diagnóstico;
- protocolo y duración;
- tratamiento y ciclos;
- turno sin superposición;
- QR firmado;
- administración finalizada;
- hoja imprimible;
- evoluciones persistidas.

La prueba genera pacientes sintéticos solo en la base donde se ejecuta. No la
ejecute sobre producción.

## Documentación y OpenAPI

Con HCOP JP iniciado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-api-docs.ps1 -Check
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-documentation.ps1
```

La primera orden comprueba que el catálogo de endpoints coincide exactamente
con Swagger. La segunda valida enlaces Markdown, páginas públicas, documentación
HTML y que cada operación OpenAPI tenga resumen, descripción, controlador y
permiso. Ambas se ejecutan también en GitHub Actions.

## Docker en GitHub

El workflow `verify.yml` construye el producto, espera la salud y destruye sus
volúmenes temporales al finalizar.
