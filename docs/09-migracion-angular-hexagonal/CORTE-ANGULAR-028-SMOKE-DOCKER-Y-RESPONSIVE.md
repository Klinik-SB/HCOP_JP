# Corte Angular 028: smoke Docker y respuesta al ancho real

## Objetivo

Ejecutar la integración de Calculadoras en una instalación Docker aislada,
validar el recorrido real con sesión autorizada y corregir las diferencias que
sólo aparecen cuando Herramientas ocupa la mitad derecha del espacio clínico.

## Entorno aislado

- proyecto Compose: `hcop-ajp-validation`;
- aplicación: `http://127.0.0.1:5181/app/`;
- base: volumen `hcop_ajp_validation_postgres`;
- archivos: volumen `hcop_ajp_validation_storage`;
- la instancia estable, sus volúmenes y el puerto 5180 no se utilizaron.

La base QA se recreó únicamente después de comprobar por etiquetas Docker que
ambos volúmenes pertenecían al proyecto de validación. La aplicación y
PostgreSQL alcanzaron estado `healthy`; `/actuator/health` respondió `UP`.

## Hallazgos y correcciones

### Contexto de construcción

El primer contexto Docker medía aproximadamente 223,89 MB porque incluía
artefactos locales de Angular. `.dockerignore` ahora excluye:

- `frontend/node_modules`;
- `frontend/dist`;
- `frontend/.angular`;
- `frontend/coverage`.

El contexto comprobado después del cambio fue de 415,87 kB.

### Permisos de la imagen

La imagen ejecutaba `chown -R` sobre todo `/opt/hcop`; esa capa demoraba más de
100 segundos aunque los catálogos ya se copiaban con propietario correcto.
Ahora el JAR y los catálogos nacen con `hcop:hcop` mediante `COPY --chown` y la
capa final sólo ajusta los directorios `runtime` y `runtime/storage`. En la
construcción verificada, esa etapa tardó 1,3 segundos.

### Calculadora comprimida por el panel

El diseño respondía al viewport completo. Con un viewport de 1280 px y un panel
derecho cercano a 500 px, `.workspace` intentaba conservar una segunda columna
de al menos 340 px; Variables quedaba ilegible.

La inspección reveló además que el host Angular tenía ancho calculado `0 px` y
su contenido sólo era visible por overflow. La corrección:

- hace que `app-calculator-workspace` ocupe el ancho flex disponible;
- define `.angular-calculator-library` como contenedor de consulta;
- apila Variables y Resultado cuando el contenedor mide hasta 980 px;
- apila selectores, campos, métricas y acciones hasta 620 px;
- conserva las media queries de viewport como respaldo.

Medidas tomadas en la imagen final:

- host Angular: 474,20 px;
- biblioteca: 459,20 px;
- workspace: una columna de 439,20 px.

## Recorrido validado

1. login con usuario QA autorizado;
2. apertura de Herramientas > Calculadoras;
3. carga de catálogo institucional vacío sin perder las 57 herramientas base;
4. selección de Superficie corporal — Mosteller;
5. ingreso de 75 kg y 180 cm;
6. resultado: `1,94 m²`;
7. recarga de la aplicación después de reconstruir y recrear el contenedor;
8. ausencia de errores en la consola del navegador.

También se comprobó que el catálogo sin sesión responde `401`, que la sesión
autorizada expone `section.tools.use` y que el endpoint autenticado devuelve un
contrato válido.

## Construcción final

- Angular productivo: correcto;
- bundle inicial: 702,72 kB sin comprimir;
- chunk diferido de Calculadoras: 261,79 kB;
- Maven package: correcto;
- imagen `hcop-jp:local`: construida;
- aplicación y PostgreSQL: `healthy`.

## Estado y deuda explícita

Calculadoras continúa **En convivencia**. El smoke autorizado, Docker y la
respuesta visual al ancho real quedan aprobados. Aún falta un recorrido visual
con usuario autenticado sin permiso y la comparación formal de todas las
resoluciones admitidas.

La migración global tampoco está terminada: `/app/` sirve Angular, pero `/`
todavía entrega el frontend anterior. No se redirige la raíz hasta cerrar la
paridad de las capacidades que permanecen `Pendiente`, porque hacerlo ahora
retiraría funcionalidad clínica vigente.
