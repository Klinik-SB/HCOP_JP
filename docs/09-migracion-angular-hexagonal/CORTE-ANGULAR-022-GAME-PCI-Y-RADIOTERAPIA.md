# Corte Angular 022: GAME, PCI y radioterapia

## Alcance

Este corte completa la biblioteca declarativa con las seis herramientas que
permanecían pendientes:

1. GAME para metástasis hepáticas colorrectales;
2. índice de cáncer peritoneal de Sugarbaker, PCI;
3. dosis por fracción desde BED o EQD2;
4. número de fracciones desde BED o EQD2;
5. fraccionamiento simultáneo para dos volúmenes;
6. fraccionamiento simultáneo para tres volúmenes.

La biblioteca alcanza **57 de 57 definiciones y reglas portadas**. Este hito
cierra la migración del código declarativo, no la capacidad visible completa:
Calculadoras permanece `Pendiente` hasta integrar el renderizador Angular, la
configuración institucional, los permisos y la comparación visual/E2E.

## Autoridad y alcance de paridad

GAME y PCI se compararon con:

- `herramientas/js/oncology-tools-gi-thorax.js`;
- `herramientas/js/oncology-rules-gi-thorax.js`.

Las cuatro herramientas radioterápicas se compararon con:

- `herramientas/js/radiotherapy-tools.js`;
- `herramientas/js/radiotherapy-rules.js`.

Se conservaron IDs, títulos, categorías, fuentes, orden y contenido de campos,
opciones, ayudas, mínimos, pasos, valores de ejemplo, ecuaciones, fronteras,
redondeos, orden de candidatos y mensajes clínicos. Los valores numéricos del
origen son ejemplos: los formularios abren vacíos. Sólo `scenario` y la
resolución SIB conservan valores iniciales porque son selectores canónicos.

Las tablas HTML construidas por el JavaScript anterior se transformaron en
notas tabulares tipadas. Conservan títulos, columnas, filas y orden, pero no
introducen HTML crudo ni acceso al DOM.

## GAME

El tumor burden score se calcula como:

`TBS = √(diámetro máximo² + número de metástasis²)`

El puntaje suma:

| Componente | Puntos |
|---|---:|
| KRAS mutado | 1 |
| CEA preoperatorio ≥20 ng/mL | 1 |
| ganglios positivos en el primario | 1 |
| TBS <3 / ≥3 y <9 / ≥9 | 0 / 1 / 2 |
| enfermedad extrahepática | 2 |

Los grupos son 0–1 bajo, 2–3 intermedio y 4–7 alto. Las pruebas cubren todos
los componentes independientes, los límites exactos de TBS 3 y 9, el umbral
inclusivo de CEA, las tres categorías y el máximo.

La grilla heredada del diámetro tiene mínimo `0,01` y paso `0,1`; por eso el
ejemplo visual `2` y ciertos cortes enteros no son representables por el
formulario aunque la regla interna sí admita esos valores. El número de
metástasis no tiene máximo declarado. GAME es pronóstico y no define por sí
solo resecabilidad ni tratamiento; KRAS no se sustituye automáticamente por un
resultado RAS agregado.

## PCI

PCI exige las trece regiones de Sugarbaker, en orden 0–12. Cada una registra:

- LS0: sin tumor visible;
- LS1: implante de hasta 0,5 cm;
- LS2: mayor de 0,5 y hasta 5 cm;
- LS3: mayor de 5 cm o enfermedad confluente.

La suma va de 0 a 39. El resultado informa carga total, regiones comprometidas,
regiones LS3 y las trece regiones evaluadas; la nota de compromiso respeta el
orden anatómico. Las pruebas recorren cada región y cada nivel, el caso sin
implantes, combinaciones dispersas y el máximo 39.

No existe un corte terapéutico universal para todas las histologías o centros,
y la estimación radiológica puede diferir de la inspección laparoscópica o
intraoperatoria.

## Conversión inversa del modelo LQ

La herramienta de dosis por fracción resuelve la raíz positiva para BED o EQD2
objetivo y luego recalcula dosis total, BED y EQD2. Exige un número entero de
fracciones y una relación α/β positiva. Se verificó la equivalencia canónica de
60 Gy EQD2 o 72 Gy BED en 30 fracciones con α/β 10: ambos producen 2 Gy por
fracción.

La herramienta de número de fracciones calcula primero el resultado teórico.
Si no es entero, recalcula el entero inferior y superior y los presenta en una
tabla comparativa con dosis total, BED, EQD2 y delta respecto del objetivo. La
frontera de entero conserva la tolerancia estricta `1e-9`. Si el resultado es
menor que una fracción, descarta cero y muestra sólo el vecino administrable
igual a uno, aunque el texto heredado siga hablando de «ambos» vecinos.

En ambas herramientas la advertencia de hipofraccionamiento es estrictamente
mayor de 5 Gy por fracción; 5 Gy exactos conserva el mensaje LQ general.

## Fraccionamiento simultáneo, SIB

SIB enumera de 1 a 200 fracciones comunes. Para cada volumen:

1. resuelve la dosis ideal por fracción para el objetivo físico o EQD2;
2. la redondea a 0,01, 0,05 o 0,10 Gy;
3. verifica el rango mínimo/máximo y la tolerancia, ambos inclusivos con
   epsilon `1e-9`;
4. ordena los candidatos por desviación normalizada total, mayor desviación y
   por último número de fracciones.

La tabla conserva sólo los primeros doce candidatos y declara cuántos se
ocultaron. Se verificaron dos y tres volúmenes, objetivos físicos y EQD2, las
tres resoluciones, tolerancia cero, ausencia de candidatos, rango invertido,
advertencia por dosis mayor de 5 Gy y orden completo de las filas canónicas.

La regla histórica admite internamente un `targetType = bed` latente, pero el
formulario, sus textos y el uso clínico sólo exponen dosis física o EQD2. El
port restringe deliberadamente SIB a esas dos opciones alcanzables y una prueba
impide habilitar BED por accidente.

## Limitaciones heredadas explícitas

Se preservan para no cambiar silenciosamente el comportamiento clínico:

- un único α/β compartido por todos los volúmenes;
- no se obliga a que el objetivo alto sea mayor o igual al medio y al bajo;
- búsqueda limitada a 200 fracciones;
- tabla limitada a doce filas y sin columna BED en SIB;
- redondeo de cada dosis al único punto de grilla más cercano, que en modo
  EQD2 puede omitir un vecino de grilla también válido o mejor;
- resultado menor de una fracción con un solo vecino pese al texto «ambos»;
- algunos errores de raíz positiva quedan resumidos por el mensaje general;
- deltas mostrados con dos decimales aunque la aceptación use epsilon `1e-9`.

El modelo LQ sigue siendo una aproximación. No incorpora tiempo total,
repoblación, reparación incompleta, heterogeneidad, recuperación tisular ni
reirradiación, y no constituye una prescripción ni un límite automático de
órgano a riesgo.

## Seguridad y evidencia

El corte queda respaldado por:

- **241/241** pruebas doradas del inventario, motor y 57 definiciones;
- diferenciales independientes de metadata 6/6;
- 21.046 evaluaciones por la interfaz declarada y 38 casos internos de borde;
- 3.959 comparaciones exactas de tablas y orden SIB;
- 5.462 combinaciones SIB sin candidato verificadas;
- notas y tablas estructuradas sin HTML crudo, `eval`, `Function`, `innerHTML`
  ni acceso al DOM;
- compilación TypeScript y comprobación de diferencias sin errores.

## Estado pendiente

No faltan definiciones clínicas del inventario. Para validar y retirar la
biblioteca anterior todavía faltan el renderizador Angular visible, la
aplicación de configuración institucional, permisos efectivos, comparación
visual/E2E y prueba integrada del producto. Esos trabajos no se mezclan con
este corte de reglas para mantener una frontera verificable y reversible.
