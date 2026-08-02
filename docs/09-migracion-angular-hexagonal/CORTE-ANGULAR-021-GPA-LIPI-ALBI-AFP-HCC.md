# Corte Angular 021: Lung GPA, LIPI, ALBI y AFP francés HCC

## Alcance

Este corte incorpora al motor declarativo Angular cuatro herramientas del
módulo canónico digestivo/torácico:

1. Lung GPA 2022 para metástasis cerebrales de cáncer pulmonar;
2. Lung Immune Prognostic Index, LIPI;
3. ALBI y mALBI para reserva hepática;
4. AFP francés para riesgo de recurrencia postrasplante en HCC.

La biblioteca alcanza **51 de 57** definiciones portadas. Permanecen GAME,
PCI y las cuatro calculadoras de radioterapia, además del renderizador Angular
visible de la biblioteca completa.

## Autoridad y estado inicial

Las definiciones se compararon con
`herramientas/js/oncology-tools-gi-thorax.js` y
`herramientas/js/oncology-rules-gi-thorax.js`.

Se conservaron IDs, títulos, categorías, fuentes, orden de campos, opciones,
ayudas, obligatoriedad, escenarios, mínimos, máximos y pasos. Los números del
origen son ejemplos visuales y los campos abren vacíos. Sólo existen tres
valores iniciales reales:

- histología `adenocarcinoma` en Lung GPA;
- unidad `mg/dL` de bilirrubina en ALBI;
- unidad `g/dL` de albúmina en ALBI.

## Lung GPA 2022

El formulario separa tres hojas pronósticas y activa los biomarcadores sólo en
adenocarcinoma. Un valor residual inválido de EGFR, ALK o PD-L1 queda ignorado
al cambiar a NSCLC no adenocarcinoma o SCLC; en adenocarcinoma los tres deben
registrarse expresamente como positivos, negativos o desconocidos.

### Componentes

| Variable | Adenocarcinoma | NSCLC no adenocarcinoma | SCLC |
|---|---:|---:|---:|
| KPS | ≤70: 0; 80: 0,5; ≥90: 1 | ≤60: 0; 70: 1; 80: 1,5; ≥90: 2 | ≤60: 0; 70: 0,5; 80: 1; 90: 1,5; 100: 2 |
| Edad | <70: 0,5 | <70: 0,5 | <75: 0,5 |
| Metástasis cerebrales | ≤4: 0,5 | ≤4: 0,5 | ≤3: 1; 4–7: 0,5; ≥8: 0 |
| Sin metástasis extracraneales | 1 | 1 | 0,5 |
| EGFR o ALK positivo | 0,5 total, no aditivo | — | — |
| PD-L1 positivo | 0,5 | — | — |

Un biomarcador desconocido puntúa cero, pero no se convierte silenciosamente
en negativo. La fuente también admite internamente un porcentaje de PD-L1 con
frontera positiva en 1 %, aunque el formulario canónico sólo expone el estado
ordinal; Angular conserva la interfaz realmente visible.

### Bandas de cohorte

| Puntaje | Banda | Adenocarcinoma mediana/IQR | No adenocarcinoma | SCLC |
|---:|---|---|---|---|
| ≤1 | 0-1.0 | 6 / 2–13 meses | 2 / 1–4 | 4 / 2–8 |
| >1 y ≤2 | 1.5-2.0 | 15 / 5–38 | 5 / 3–12 | 8 / 4–15 |
| >2 y ≤3 | 2.5-3.0 | 30 / 12–no alcanzado | 10 / 4–21 | 13 / 7–23 |
| >3 | 3.5-4.0 | 52 / 25–69 | 19 / 8–33 | 23 / 11–no alcanzado |

Las pruebas recorren cada peso y las doce combinaciones histología/banda. La
severidad visual es mala hasta 1, advertencia hasta 2 y favorable por encima de
2, exactamente como en el origen.

Las supervivencias son observaciones de cohortes, no predicciones individuales.
La herramienta corresponde al diagnóstico inicial de metástasis cerebrales y
la cohorte excluyó recurrencia cerebral y carcinomatosis leptomeníngea. No
compara tratamientos.

## LIPI

Se conserva la fórmula:

`dNLR = neutrófilos absolutos / (leucocitos totales - neutrófilos absolutos)`

LIPI suma:

- un punto con dNLR estrictamente mayor de 3;
- un punto con LDH estrictamente mayor que su límite superior normal.

Los grupos son 0 bueno, 1 intermedio y 2 pobre. Las pruebas distinguen una
razón mostrada como 3,00 que permanece debajo del corte y una razón 3,04 que
puntúa, LDH igual o mayor que el límite y los tres grupos. Neutrófilos iguales
o mayores que leucocitos producen un error clínico en lugar de dividir por
cero o por un denominador negativo.

La herramienta no valida unidades: leucocitos y neutrófilos deben ser
comparables entre sí, igual que LDH y su límite normal. Infección, inflamación,
corticoides o factores estimulantes pueden modificar los componentes. LIPI es
pronóstico y no selecciona por sí solo un tratamiento.

## ALBI y mALBI

El cálculo normaliza primero:

- bilirrubina de mg/dL a μmol/L mediante `×17,1`;
- albúmina de g/dL a g/L mediante `×10`.

Luego aplica:

`ALBI = 0,66 × log10(bilirrubina μmol/L) − 0,085 × albúmina g/L`

Los límites inclusivos incorporan la tolerancia canónica `1e-12` para evitar
que unos pocos ULP de `log10` cambien el grupo:

- grado 1: ALBI ≤ −2,60;
- grado 2: >−2,60 y ≤−1,39;
- grado 3: >−1,39;
- mALBI 2a: grado 2 y ALBI ≤−2,27;
- mALBI 2b: resto del grado 2.

Las pruebas cubren ambos sistemas de unidades, los tres límites exactos con la
tolerancia y valores representables inmediatamente a ambos lados. El resultado
se muestra con tres decimales: un valor apenas superior puede verse `-2.600`
pero corresponder a grado 2, o verse `-1.390` y corresponder a grado 3. La
categoría se obtiene del valor sin redondear.

ALBI no incorpora ascitis, encefalopatía, hipertensión portal ni volumen
hepático remanente y no determina por sí solo una conducta oncológica.
La metadata canónica atribuye la herramienta completa a Johnson 2015, pero no
declara una referencia bibliográfica separada para la subdivisión mALBI 2a/2b.
Esa fuente específica queda como deuda documental antes de una validación
clínica final.

## AFP francés para trasplante en HCC

Los componentes son:

| Componente | 0 puntos | 1–2 puntos | 3–4 puntos |
|---|---|---|---|
| Mayor diámetro | ≤3 cm | >3 y ≤6 cm: 1 | >6 cm: 4 |
| Nódulos | ≤3 | >3: 2 | — |
| AFP | ≤100 ng/mL | >100 y ≤1000: 2 | >1000: 3 |

El score va de 0 a 9. Hasta 2 conserva la categoría de menor riesgo del modelo;
desde 3 corresponde a mayor riesgo. Se probaron 3/6 cm, 3/4 nódulos,
100/1000 ng/mL y los valores inmediatamente superiores, además del máximo.

Es un modelo de recurrencia postrasplante, no una estadificación general de
HCC. No incorpora por sí solo invasión macrovascular, enfermedad extrahepática
ni criterios administrativos locales.
La definición canónica identifica a Duvoux et al., Gastroenterology 2012, sin
enlace ni ficha bibliográfica ampliada; la referencia original y su adaptación
al protocolo local deben verificarse antes de uso institucional.

## Grillas numéricas heredadas

El motor Angular valida el `step` desde el `min`, como la restricción declarada
por el formulario. Varias combinaciones canónicas usan un mínimo desplazado y
un ejemplo que no cae en esa misma grilla:

- LIPI: WBC 7 con mínimo 0,001/paso 0,01; LDH 200 y LSN 250 con mínimo
  0,001/paso 0,1;
- ALBI: bilirrubina 1 y albúmina 4 con mínimo 0,001/paso 0,01;
- AFP: diámetro 3 con mínimo 0,01/paso 0,1.

Por eso esos ejemplos son sólo placeholders y, si se ingresan literalmente,
producen `step-mismatch`. En AFP, 3 y 6 cm tampoco son representables en la
grilla pública; los vecinos válidos son 2,91/3,01 y 5,91/6,01. Las reglas
internas conservan y prueban los cortes exactos inclusivos. Esta inconsistencia
heredada queda explícita para que una futura corrección se haga de forma
coordinada entre definición, motor, pruebas y UX, no mediante un parche local.

Angular también exige completar campos requeridos. No conserva la coerción
accidental del JavaScript anterior donde ciertos vacíos podían convertirse en
cero antes de la regla clínica.

## Seguridad y evidencia

Las cuatro definiciones producen exclusivamente texto y métricas tipadas. No
incorporan HTML crudo, `eval`, `Function`, acceso al DOM, `innerHTML` ni
`outerHTML`.

El corte queda respaldado por:

- **217/217** pruebas doradas del inventario, motor y cincuenta y una
  calculadoras;
- todos los componentes y las doce bandas de Lung GPA;
- cortes y tres categorías LIPI, incluida coherencia ANC/WBC;
- conversiones, tolerancia y fronteras ALBI/mALBI;
- nueve puntos y todos los límites del AFP francés;
- defaults reales, ejemplos vacíos, escenarios y grillas desplazadas;
- auditoría diferencial independiente;
- compilación TypeScript, build Angular de producción, auditoría estática y
  `git diff --check`.

## Estado pendiente

La fila general de Calculadoras permanece `Pendiente`. Faltan seis definiciones,
el renderizador Angular visible, configuración institucional, comparación
visual/E2E y validación de permisos antes de retirar la biblioteca anterior.
