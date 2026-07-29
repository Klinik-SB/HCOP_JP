# 09 · Migrar y poner en marcha

## Estrategia

La migración no es copiar carpetas. Debe preservar significado, orden,
relaciones, archivos, autoría y fechas.

Fases:

1. inventario;
2. mapeo;
3. extracción;
4. transformación;
5. carga;
6. reconciliación;
7. aceptación;
8. corte;
9. observación;
10. retiro controlado.

## Inventario

Para cada origen registre:

- tablas/archivos;
- volumen;
- claves;
- codificación;
- zona horaria;
- campos nulos;
- duplicados;
- relaciones implícitas;
- estados y valores libres;
- datos que ya no deben migrarse.

No programe el importador antes de cerrar este inventario.

## Mapeo

Construya una matriz:

| Origen | Destino | Transformación | Validación | Reversibilidad |
|---|---|---|---|---|
| paciente | `patients` | normalizar identidad | conteo + muestra | conservar ID origen |
| hoja | documento JSONB | normalizar estructura/orden | hash + render | conservar snapshot |
| tratamiento | tablas clínicas | estados/ciclos | totales y relaciones | trazabilidad |
| aplicación | sesiones | zona/estado/duración | agenda | ID de origen |
| archivo | storage + metadata | nombre/hash | SHA-256 | copia original |

Todo valor no mapeado se reporta; no se descarta silenciosamente.

## Importador

Buenas prácticas:

- ejecución repetible/idempotente;
- lotes transaccionales;
- checkpoints;
- logs sin PHI;
- reporte de errores por ID técnico;
- modo dry-run;
- no depender de UI;
- validación de hash;
- overlay para correcciones locales si se reimporta.

## Reconciliación

Compare:

- pacientes por estado;
- historias;
- diagnósticos;
- tratamientos/ciclos;
- turnos;
- archivos y bytes;
- fechas mínimas/máximas;
- relaciones huérfanas;
- hashes;
- muestras clínicas aprobadas.

Un conteo igual no demuestra semántica correcta; combine totales, invariantes y
revisión visual.

## Ensayo

Ejecute al menos dos migraciones completas en entornos descartables. Mida:

- duración;
- espacio;
- errores;
- intervención manual;
- ventana de corte;
- rollback;
- tiempo de verificación.

## Corte

1. comunicar ventana;
2. backup del origen;
3. poner origen en sólo lectura;
4. extracción final;
5. importar;
6. reconciliar;
7. habilitar HCOP JP;
8. monitorear;
9. mantener origen sólo lectura durante el período acordado.

No permita escritura simultánea sin un mecanismo explícito de sincronización.

## Puesta en marcha

Antes del primer usuario:

- secretos reales;
- HTTPS/VPN;
- roles revisados;
- administrador identificado;
- backup automatizado;
- restauración ensayada;
- storage suficiente;
- zona horaria;
- URL pública;
- impresoras/QR;
- capacitación;
- procedimiento de incidente.

## Rollback

Defina antes del corte:

- condición de rollback;
- responsable;
- tiempo máximo;
- qué datos nuevos se perderían;
- cómo exportarlos;
- compatibilidad de esquema;
- cómo reabrir el origen.

## Hito de aceptación

Responsables clínico, técnico y operativo firman una evidencia con conteos,
excepciones, pruebas de muestras, recuperación, rendimiento y decisión de corte.
