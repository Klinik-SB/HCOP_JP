# Corte Angular 008: Herramientas, Guías y AJCC/TNM

## Alcance

La solapa **Herramientas** comienza a estar gobernada por Angular con dos
capacidades nativas y utilizables sin paciente activo:

- biblioteca y apertura de **Guías clínicas PDF**;
- selección de sitio, categorías TNM y cálculo de estadio **AJCC 8**.

Angular conserva la geometría y las clases visuales de la solapa vigente. No
carga la aplicación anterior dentro de un `iframe`, no ejecuta `app.js` y no
duplica reglas de estadificación en el navegador. Los archivos PDF se obtienen
directamente desde el backend local y las reglas AJCC se ejecutan en el
servidor.

Este corte **no declara migradas las calculadoras**. Las 57 calculadoras y
scores de la interfaz anterior permanecen como deuda explícita de transición
hasta que exista paridad funcional, visual y de resultados para cada una.
Angular no enlaza la ruta antigua `/herramientas/`: la auditoría descartó ese
puente porque no preservaba de forma demostrable los permisos, la configuración
institucional por rol ni la codificación segura del contenido configurable.

## Contratos

### Guías

- `GET /api/guides`: lista metadatos de las guías activas.
- `GET /api/guides/file?name={name}`: entrega el PDF local con
  `Content-Type: application/pdf` y disposición segura en línea.

Ambas consultas requieren `section.tools.view`. La carga, sustitución,
versionado o archivado continúa perteneciendo a Configuración y conserva sus
permisos administrativos; la solapa Herramientas es de consulta.

### AJCC 8 y TNM

- `GET /api/ajcc8`: lista los sitios tumorales agrupados.
- `GET /api/ajcc8/detail?id={id}`: devuelve ejes, categorías, descripciones y
  notas del sitio seleccionado.
- `POST /api/ajcc8/stage`: calcula el grupo de estadio a partir del sitio y de
  los valores TNM y factores específicos.

El catálogo y el detalle requieren `section.tools.view`. Ejecutar el cálculo
requiere `section.tools.use`. El interceptor aplica estas autorizaciones antes
de resolver los argumentos MVC —en particular, antes de materializar el cuerpo
de `POST /stage`— y el controlador repite el control como segunda barrera.

## Interacción Angular

La biblioteca permite buscar por título, sitio, fuente, audiencia y etiquetas.
Seleccionar una guía abre el archivo exacto sin abandonar el contexto de la
solapa. Los resultados se normalizan, se ordenan y se almacenan en caché; una
actualización de Configuración invalida la biblioteca para evitar mostrar
metadatos antiguos.

La herramienta AJCC agrupa los sitios por región, abre la definición elegida y
presenta primero T, N y M, seguidos de los factores propios del sitio. Cambiar
de sitio cancela la selección y el resultado anteriores. Las solicitudes de
detalle y cálculo están correlacionadas: una respuesta tardía nunca puede
reemplazar el sitio o la combinación actualmente visibles.

El resultado muestra el estadio calculado, los datos faltantes y la referencia
de la regla cuando el catálogo la provee. Un usuario con permiso de lectura
pero sin `section.tools.use` puede consultar las definiciones, pero no ejecutar
el cálculo.

## Seguridad y autoridad de datos

- PostgreSQL y los catálogos locales empaquetados continúan siendo la
  autoridad; Angular sólo presenta contratos tipados.
- Los nombres de archivo de Guías se validan en el backend y no pueden escapar
  del almacenamiento asignado.
- El navegador no interpreta HTML recibido del servidor ni usa `innerHTML`.
- Los errores `401`, `403`, validación, archivo faltante y contrato inválido se
  muestran sin reutilizar datos de una solicitud previa.
- La solapa no exige ni modifica el paciente activo.

## Archivos principales

- `frontend/src/app/features/tools/tools.component.*`: presentación y estados
  de Guías y AJCC/TNM.
- `frontend/src/app/features/tools/tools.service.ts`: contratos HTTP, caché,
  invalidación y normalización.
- `frontend/src/app/features/tools/tools.models.ts`: modelos tipados del corte.
- `src/main/java/ar/com/hexium/hcop/guide/**`: módulo hexagonal de Guías.
- `src/main/java/ar/com/hexium/hcop/catalog/AjccCatalogController.java`:
  catálogo y cálculo AJCC con autorización en el controlador.
- `src/main/java/ar/com/hexium/hcop/auth/AuthInterceptor.java`: autorización
  temprana de los endpoints AJCC.

## Evidencia requerida

Antes de elevar este corte a `Validada` se debe comprobar:

1. build Angular de producción sin `iframe`, `app.js` ni HTML inyectado;
2. búsqueda, apertura y cierre de varios PDF, incluido archivo inexistente;
3. `Content-Type`, nombre y bytes de una guía descargada;
4. catálogo AJCC, cambio rápido de sitio y ejes adicionales a T/N/M;
5. cálculo válido, combinación incompleta y combinación sin regla;
6. usuario con `section.tools.view`, usuario con ambos permisos y usuario sin
   acceso, verificando `401/403` tanto en pantalla como en API;
7. rechazo de `POST /stage` antes del binding cuando falta
   `section.tools.use`;
8. pruebas Java focales, suite completa, OpenAPI sin rutas duplicadas, imagen
   Docker, PostgreSQL y smoke integral;
9. comparación visual en ancho normal y reducido, con un único scroll de la
   sección.

## Estado y deuda explícita

Guías y AJCC/TNM quedan **En convivencia** hasta completar toda la evidencia
visual y end-to-end. El backend hexagonal de Guías y las barreras de permisos
AJCC ya están delimitados, pero esto no convierte a toda la solapa Herramientas
en una capacidad terminada.

Las **57 calculadoras y scores** permanecen `Pendiente`. El corte futuro deberá
inventariarlas una por una, definir variables y unidades, portar fórmulas y
rangos, comparar resultados límite, conservar explicaciones clínicas y enlazar
el constructor no programático de Configuración. Hasta entonces no se retirará
su implementación vigente ni se contabilizarán como migradas.
