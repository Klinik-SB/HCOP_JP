# Corte Angular 007: Protocolos

## Alcance

La solapa **Protocolos** pasa a estar gobernada por Angular y conserva la
geometría, jerarquía y clases visuales del explorador clínico vigente. Es una
vista global de consulta: no requiere paciente abierto y no permite crear,
editar ni archivar. Esas acciones continúan en Configuración.

El corte distingue de forma explícita dos autoridades:

- **Protocolos clínicos**: protocolos locales versionados en PostgreSQL y
  entradas COIR no vinculadas, expuestos por la API hexagonal;
- **Referencia SEER*Rx**: catálogo de codificación sin valor prescriptivo,
  mostrado como referencia aun cuando carezca de dosis o preparación.

## Contratos

- `GET /api/clinical/protocols?includeCatalog=1`: lista canónica de protocolos
  locales y COIR sin duplicar un COIR ya vinculado.
- `GET /api/clinical/protocols/{id}`: detalle normalizado, componentes, drogas,
  preparaciones y presentaciones del protocolo clínico seleccionado.
- `GET /api/protocols?source=seer`: referencia SEER*Rx compatible.
- `GET /api/protocols/detail?id={id}&source=seer`: detalle de la referencia
  seleccionada.

Las cuatro consultas exigen `section.protocols.view`. Los dos endpoints de
compatibilidad conservan el control dentro del controlador y además se
autorizan antes del binding mediante el interceptor común.

Los identificadores no se intercambian entre familias: un protocolo local,
`coir-347` y `seer-17` son identidades distintas aunque compartan un nombre.

## Interacción

El servicio Angular mantiene caché por fuente e invalida los datos cuando se
emite `hcop-protocol-catalog-updated`. Cambiar fuente, categoría o esquema
limpia inmediatamente toda selección descendente. Las cargas de detalle se
cancelan y correlacionan con fuente e identificador, de modo que una respuesta
tardía nunca puede reemplazar el protocolo visible.

La vista conserva:

- selector de fuente, grupo, esquema y droga;
- resumen con días por ciclo, cantidad de drogas y duración operativa;
- lista de drogas por día, dosis, cálculo y vía;
- detalle de administración y aplicación en Hospital de Día;
- instrucciones de preparación y presentaciones;
- estados explícitos para datos incompletos, errores y catálogos de referencia.

No se usa `innerHTML`: todos los valores se muestran mediante interpolación
Angular. Los estados y controles conservan semántica de pestaña, foco por
teclado y anuncios `aria-live`.

## Apariencia

El host Angular es hijo directo de `.right-panel-body` y mantiene
`right-tab-panel active`, `data-right-panel="protocols"` y el identificador
relacionado con la pestaña. Por eso hereda el contrato CSS final de la versión
vigente: altura completa, scroll vertical único, selectores de 36 px, tarjeta
azul de droga, tipografía y espaciado Lira.

## Archivos principales

- `frontend/src/app/features/protocols/protocol.component.*`: presentación y
  estados de la solapa, expuesta como `app-protocol-explorer`.
- `frontend/src/app/features/protocols/protocol.service.ts`: caché,
  invalidación, cancelación y adaptación de fuentes.
- `frontend/src/app/features/protocols/protocol.models.ts`: contratos de vista
  con identidad nominal por fuente.
- `src/main/java/ar/com/hexium/hcop/catalog/LegacyCatalogController.java`:
  compatibilidad SEER protegida.
- `src/main/java/ar/com/hexium/hcop/protocol/**`: autoridad hexagonal para
  protocolos clínicos.

## Evidencia requerida

- build Angular de producción;
- pruebas Java de permisos y suite completa;
- usuario con permiso y usuario sin permiso;
- cambio rápido de fuente/esquema sin respuestas cruzadas;
- protocolos local, COIR, COIR incompleto y SEER sin dosis;
- comparación visual en ancho normal y reducido;
- imagen Docker, PostgreSQL, smoke y verificación OpenAPI.

## Validación del corte

Ejecutada el 1 de agosto de 2026 sobre una base PostgreSQL vacía y una imagen
Docker construida desde el árbol de trabajo:

- build Angular de producción correcto, sin `iframe` ni ejecución de
  `app.js`;
- 179 pruebas Java correctas, incluidas seguridad y reglas hexagonales;
- 11 migraciones Flyway aplicadas y `/actuator/health` en `UP`;
- 803 protocolos locales/COIR y 458 referencias SEER*Rx recuperados;
- detalle correlacionado con el identificador solicitado y componentes
  disponibles;
- acceso anónimo rechazado con `401` y permiso
  `section.protocols.view` confirmado para el usuario autorizado;
- smoke integral correcto y 111 operaciones OpenAPI únicas verificadas;
- 70 archivos Markdown y sus vínculos internos verificados.

La comparación visual completa y la administración Angular de protocolos
siguen siendo requisitos para marcar la capacidad como `Validada`; por eso el
estado permanece `En convivencia`.
