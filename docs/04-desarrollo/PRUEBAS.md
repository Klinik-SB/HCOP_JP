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

## Docker en GitHub

El workflow `verify.yml` construye el producto, espera la salud y destruye sus
volúmenes temporales al finalizar.
