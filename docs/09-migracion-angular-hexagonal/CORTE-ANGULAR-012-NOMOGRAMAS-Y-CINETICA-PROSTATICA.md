# Corte Angular 012: nomogramas y cinética prostática

## Objetivo

Este corte amplía el motor declarativo Angular con cuatro herramientas del bloque de próstata:

1. preparación de datos para nomogramas MSKCC;
2. PBCG de riesgo antes de biopsia;
3. densidad, cinética de PSA y recaída bioquímica;
4. clasificación CHAARTED / LATITUDE.

La biblioteca alcanza **15 de 57** definiciones portadas. El renderizador visible continúa pendiente; este corte conserva formularios, reglas, mensajes y datos de salida sin depender del JavaScript legacy.

## Formularios y escenarios

- Números, textos, áreas de texto y selectores comunes abren vacíos. Los valores legacy se conservan como ejemplos o placeholders.
- Los checkbox abren desmarcados.
- El selector MSKCC conserva `pre` como escenario efectivo inicial.
- Sólo los campos obligatorios del escenario MSKCC visible participan en la validación.
- Textos y áreas de texto tienen normalización propia; nunca se convierten accidentalmente a números.
- La serie PSA conserva el formato de una medición por línea, separada por punto y coma o tabulación, con coma o punto decimal.

## Reglas comparadas

### MSKCC

Se conservan siete escenarios: preoperatorio, postoperatorio, recaída post-prostatectomía, riesgo de biopsia, PSA doubling time, expectativa de vida y volumen/densidad. No se calculan porcentajes locales. La salida prepara:

- enlace HTTPS al nomograma oficial;
- checklist tipado de obligatorios y opcionales;
- tabla tipada de completitud de todos los escenarios.

La validación global impide calcular el escenario seleccionado incompleto, igual que la interfaz anterior. Por eso la salida seleccionada llega normalmente lista; los faltantes se muestran en la vista global de los otros escenarios.

### PBCG

Se conservaron los coeficientes públicos, las probabilidades mutuamente excluyentes y los límites inclusivos de edad 40–90 años y PSA 2–50 ng/ml. La referencia oficial se representa como enlace tipado.

### PSA-D, PSA-DT y BCR

- PSA-D mantiene PSA dividido por volumen prostático.
- PSA-DT usa regresión de `ln(PSA)` contra meses reales de 30,4375 días.
- La velocidad usa regresión lineal de PSA y se anualiza.
- Post-radioterapia conserva Phoenix: PSA actual ≥ nadir + 2 ng/ml.
- Post-prostatectomía conserva PSA ≥0,2 ng/ml y el checkbox de segunda determinación confirmatoria.
- Las advertencias de menos de tres mediciones, intervalos menores de 28 días y ventanas mayores de 12 meses permanecen separadas.

### CHAARTED / LATITUDE

CHAARTED conserva alto volumen por metástasis visceral o al menos cuatro lesiones óseas con una fuera de columna/pelvis. LATITUDE conserva alto riesgo al reunir al menos dos de tres factores: visceral, Gleason ≥8 y al menos tres lesiones óseas.

## Datos estructurados seguros

Los enlaces, checklists y tablas dejaron de ser fragmentos HTML. El modelo Angular admite exclusivamente texto, números y estructuras discriminadas con enlaces HTTPS. No se incorporan ejecución dinámica ni escritura directa de HTML.

## Limitaciones heredadas documentadas

- MSKCC comprueba presencia, no coherencia cruzada, entre fechas y valores de PSA. El campo de meses entre primer y último PSA no integra su checklist oficial.
- Varios campos MSKCC combinan mínimo `0.01` con paso `0.1`; por reglas HTML, ejemplos enteros como 8 pueden producir desajuste de paso si se escriben literalmente.
- La serie PSA descarta silenciosamente filas sin fecha válida o con PSA no positivo. Fechas ISO imposibles pueden ser normalizadas por `Date`, comportamiento heredado del navegador.
- El número de metástasis óseas no declara paso entero y, por paridad, todavía acepta fracciones.
- Un escenario programático MSKCC desconocido ahora se rechaza como opción inválida. Es un endurecimiento seguro de una entrada imposible desde el selector legacy.

Estas limitaciones no se corrigieron dentro del port para evitar modificar silenciosamente la conducta clínica. Deben resolverse mediante una decisión funcional separada antes de habilitar la biblioteca final.

## Evidencia

- 55/55 pruebas doradas del inventario, motor y quince calculadoras;
- casos normales, límites, escenarios, series insuficientes o malformadas, fechas, confirmación y seguridad;
- compilación Angular de producción;
- auditoría estática y de codificación;
- `git diff --check` sin errores.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 42 definiciones, el renderizador Angular visible, configuración institucional y comparación visual/E2E antes de retirar la ruta anterior.
