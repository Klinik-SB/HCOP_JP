# 02 · Construir la arquitectura MVC

## Regla de dependencias

```text
Vista → Controller → Service → Repository → PostgreSQL
                         └────→ Storage / integración externa
```

La dependencia nunca vuelve en sentido contrario. El Repository no conoce HTTP;
el Service no conoce botones; la Vista no conoce SQL.

## Controller

Responsabilidades:

- declarar método y ruta;
- resolver parámetros/cuerpo;
- exigir sesión y permiso;
- aplicar validación sintáctica;
- delegar una sola operación de aplicación;
- elegir el código HTTP.

No debe:

- ejecutar SQL;
- abrir archivos arbitrarios;
- implementar una transición clínica compleja;
- devolver excepciones internas;
- decidir autorización por un valor enviado por el cliente.

Patrón:

```java
@PostMapping("/api/example")
Map<String, Object> create(
    @Valid @RequestBody CreateRequest body,
    HttpServletRequest request) {
  SessionPrincipal actor = auth.requirePermission(request, "section.example.edit");
  return service.create(body, actor);
}
```

## Service

Es la capa de reglas. Debe:

- validar invariantes del dominio;
- controlar transiciones de estado;
- comenzar la transacción;
- coordinar repositorios;
- implementar idempotencia;
- agregar evolución/auditoría cuando corresponda;
- devolver un resultado estable.

Use `@Transactional` en el límite del caso de uso, no en cada consulta. Si una
prescripción crea cabecera, detalle, ciclos y evolución, todo pertenece a una
sola transacción.

## Repository

Debe contener:

- SQL parametrizado;
- mapeo fila/objeto;
- `INSERT`, `UPDATE`, `SELECT` y operaciones atómicas;
- comparación de `revision`;
- consultas enfocadas e indexables.

No concatenar entrada del usuario dentro del SQL. Para cambios versionados:

```sql
UPDATE recurso
   SET dato = ?, revision = revision + 1, updated_at = clock_timestamp()
 WHERE id = ? AND revision = ?
RETURNING revision;
```

Si no vuelve una fila, el Service diferencia inexistencia de conflicto y
responde `404` o `409`.

## Modelos HTTP y modelos internos

No usar una fila de base como contrato público universal. Separe:

- request validado;
- modelo de dominio;
- fila de repositorio;
- response;
- representación histórica/snapshot.

Esto evita que una columna nueva se filtre accidentalmente por la API o que el
contrato dependa de una decisión de almacenamiento.

## Paquetes por dominio

Cada dominio agrupa lo que cambia junto:

```text
treatment/
  TreatmentController.java
  TreatmentService.java
  TreatmentRepository.java
  modelos específicos si son necesarios
```

Las utilidades realmente transversales van en `common` o `config`. Evite un
“servicio genérico” que termine con reglas de todos los dominios.

## Comunicación entre dominios

- use un Service público, no el Repository ajeno desde un Controller;
- evite dependencias circulares;
- para un acto que modifica varios dominios, elija un Service orquestador;
- persista un snapshot cuando un catálogo mutable deba quedar históricamente
  estable;
- emita auditoría dentro de la misma transacción.

## Manejo de errores

Centralice excepciones HTTP en un handler:

```json
{
  "ok": false,
  "error": "Mensaje seguro",
  "code": "conflict",
  "status": 409
}
```

No devolver stack traces, SQL, rutas internas ni secretos. El log técnico puede
usar un request ID para correlación.

## Hito de aceptación

Para el primer dominio vertical implemente:

1. migración;
2. Repository con integración PostgreSQL;
3. Service transaccional;
4. Controller autorizado;
5. OpenAPI;
6. prueba de éxito;
7. prueba de entrada inválida;
8. prueba de permiso;
9. prueba de conflicto.

Use ese corte vertical como plantilla, no cree primero todos los Controllers y
deje persistencia/seguridad para el final.
