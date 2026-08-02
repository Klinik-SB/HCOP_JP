# Corte Angular 029 · tratamientos históricos en la hoja clínica

Este corte corrige una pérdida de representación en la hoja Angular. La
persistencia ya conservaba cirugías y radioterapia, pero la interfaz mostraba
todos los registros de `state.treatments` como sistémicos y dejaba Cirugías
oncológicas permanentemente vacía.

## Contrato aplicado

La proyección visual reúne, por orden de autoridad:

1. `workspace.treatments.oncology`, que es la vista relacional operativa
   entregada por Java;
2. `state.treatments`, para documentos clínicos estructurados anteriores;
3. colecciones narrativas históricas dentro de `oncology`, cuando existan;
4. `state.evolutions` sólo cuando `category`, `kind`, `type` o
   `sourceRef.kind` identifiquen explícitamente una cirugía, radioterapia o
   tratamiento sistémico. Esto incluye la marca productiva
   `sourceRef.kind = oncological-treatment` que crea el alta local.

Una evolución que sólo menciona una cirugía en su texto no cambia de sección.
Los registros eliminados se excluyen. Los espejos entre fuentes se deduplican
por sus identificadores y referencias. Cada identificador conserva su dominio
(`treatment`, `clinical-entry`, `evolution`, `external` o `source`) para que dos
tablas distintas no se fusionen por compartir un número. La fuente prioritaria
conserva sus valores y la secundaria únicamente completa campos vacíos. La
categoría se decide por confianza —marca explícita, colección, inferencia y
valor por defecto— antes de usar la prioridad de la fuente como desempate.
Los registros sin identificador se preservan individualmente: la interfaz no
elimina dos actos legítimos sólo porque compartan fecha y descripción.

La hoja presenta ahora tres secciones independientes y ordenadas:

- Tratamientos sistémicos;
- Tratamientos radioterápicos;
- Cirugías oncológicas.

La línea de tiempo también respeta las marcas explícitas `surgery` y
`radiotherapy` de los eventos históricos. No se modificó ningún documento
clínico ni se migraron datos para lograr esta visualización.

## Evidencia

- `clinical-treatment-projection`: 23 casos y 53 aserciones, incluidos el alta
  local real, el envelope relacional, enlaces transitivos, tombstones,
  colisiones entre dominios, registros anónimos repetidos, nombres completos de
  terapias y categorías operativas detalladas;
- la suite se ejecuta desde `npm test` y bloquea la etapa Angular del Dockerfile;
- compilación de producción Angular satisfactoria;
- construcción completa de la imagen `hcop-jp:local` y contenedor QA saludable
  en `http://localhost:5181/app/`;
- verificación sobre el documento clínico anonimizado de QA: dos cirugías, una
  radioterapia y ausencia correcta de tratamientos sistémicos;
- cero errores de consola durante el recorrido autenticado.

## Estado de migración

Este corte elimina una diferencia de lectura, pero no marca la capacidad Hoja
clínica como validada. Continúan pendientes los formularios de edición, la
impresión, los conflictos de guardado y la comparación visual completa. La raíz
`/` todavía sirve la interfaz vigente y Angular continúa en `/app/`.
