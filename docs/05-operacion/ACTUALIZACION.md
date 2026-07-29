# Actualización

El acceso directo **HCOP JP** ejecuta el instalador de forma idempotente:

1. descarga una versión nueva;
2. actualiza la imagen;
3. mantiene `.env`;
4. mantiene los volúmenes;
5. aplica migraciones Flyway;
6. abre el navegador.

Antes de una actualización importante haga backup.

Para actualizar manualmente:

```powershell
docker compose -f compose.github.yaml pull
docker compose -f compose.github.yaml up --detach --wait
```

No edite archivos dentro de un contenedor. Los cambios se pierden al reemplazar
la imagen.
