# Corte Angular 017: mama, pronóstico y respuesta

## Alcance

Este corte incorpora cuatro herramientas del módulo oncológico general al
motor declarativo Angular:

1. Nottingham Prognostic Index (NPI);
2. Residual Cancer Burden (RCB), implementación local experimental;
3. Preoperative Endocrine Prognostic Index (PEPI);
4. CTS5 para recurrencia tardía.

La biblioteca alcanza **35 de 57** definiciones portadas. Faltan 22
herramientas de los módulos oncológicos general, ginecológico,
digestivo/torácico y de radioterapia, además del renderizador Angular visible.

## Autoridad y formulario

La autoridad comparada fue
`herramientas/js/oncology-tools-general.js` para formularios y salidas, junto
con `herramientas/js/oncology-rules-general.js` para fórmulas y fronteras.

Todos los números y selectores abren vacíos. Los valores `value` de la fábrica
anterior se conservan solamente como ejemplos grises. Se preservaron orden,
etiquetas, opciones, mínimos, máximos, pasos, textos de alcance y campos
anchos.

Las fuentes y archivos de créditos/`NOTICE` sirven como trazabilidad y no
implican certificación, aval ni licencia especial de las organizaciones
nombradas. No existe un `LICENSE` raíz que permita atribuir una licencia
particular a estas reglas.

## Nottingham Prognostic Index

Se preserva la fórmula:

`NPI = 0,2 × tamaño invasivo en cm + grado + categoría ganglionar`

La categoría ganglionar vale 1 sin ganglios positivos, 2 con 1–3 y 3 con al
menos 4. Los grupos se mantienen en sus fronteras inclusivas:

- hasta 2,4: excelente;
- hasta 3,4: bueno;
- hasta 4,4: moderado I;
- hasta 5,4: moderado II;
- hasta 6,4: pobre;
- por encima de 6,4: muy pobre.

Es un modelo pronóstico histórico. No incorpora ER, HER2, Ki-67, genómica ni
tratamientos contemporáneos y no determina por sí solo una indicación o
intensidad terapéutica. Debe usarse el tamaño invasivo y el grado histológico
definitivo.

### Defecto heredado visible

El formulario canónico declara mínimo `0,01` cm y paso `0,1` cm. Por la regla
HTML de pasos, el ejemplo `2,00` cm no pertenece a la progresión
`0,01 + n × 0,1` y se rechaza como incremento inválido. El primer valor cercano
admitido es `2,01`; con grado 2 y N0 produce un NPI bruto de 3,402. La pantalla
muestra `3,40`, pero el grupo es `moderado I`, mientras que la regla directa en
3,400 corresponde a `bueno`. Se conserva esta contradicción por paridad y se
prueba explícitamente; no debe corregirse sin una decisión clínica y de UX.

## RCB experimental

La reconstrucción local conserva:

`diámetro geométrico = raíz(d1 × d2)`

`fracción invasiva = celularidad/100 × (1 − in situ/100)`

`término primario = 1,4 × (fracción invasiva × diámetro geométrico)^0,17`

`término ganglionar = [4 × (1 − 0,75^ganglios) × mayor metástasis]^0,17`

`RCB local = término primario + término ganglionar`

Las clases locales son RCB-0 sólo con total exactamente 0, RCB-I hasta 1,36,
RCB-II hasta 3,28 y RCB-III por encima de 3,28. El ejemplo de fábrica produce
1,5370335 y RCB-II. Las pruebas cubren ambos lados de 1,36 y 3,28 aunque el
título redondeado resulte idéntico.

El número de ganglios y la mayor metástasis deben ser coherentes: N0 exige
0 mm y cualquier N positivo exige un diámetro mayor de 0.

### Uso experimental y endurecimiento seguro

La herramienta sigue identificada como **experimental** y siempre requiere
confirmación con la calculadora oficial de MD Anderson antes de documentar o
usar el resultado. El enlace HTML crudo de la interfaz anterior fue reemplazado
por un `CalculatorExternalLink` tipado, limitado a HTTPS. De este modo se
preserva el destino oficial sin introducir `innerHTML`, etiquetas o atributos
ejecutables en el resultado.

La medición debe provenir de una evaluación anatomopatológica estandarizada del
lecho posneoadyuvancia. Este cálculo local no puede indicar automáticamente un
tratamiento.

### Defectos heredados relevantes

- con celularidad global 0, un componente in situ de 50 % es aceptado y el
  resultado es RCB-0, porque la restricción sólo se activa cuando la celularidad
  es mayor de 0;
- un único diámetro del lecho igual a 0 anula el diámetro geométrico y puede
  producir RCB-0 aunque el otro diámetro y la celularidad sean positivos;
- celularidad 10 % e in situ 80 % se rechaza porque el código compara ambos
  porcentajes directamente, aunque sus denominadores anatomopatológicos pueden
  representar conceptos diferentes.

Estos comportamientos se documentan y prueban por paridad. Refuerzan que esta
implementación no sustituye la calculadora oficial.

## PEPI

PEPI se mantiene restringido a cáncer de mama ER positivo tratado con
endocrinoterapia neoadyuvante y evaluado en la pieza quirúrgica residual. No se
aplica al diagnóstico basal, después de quimioterapia neoadyuvante ni fuera de
enfermedad hormonosensible.

Los componentes conservados son:

- pT1–pT2: 0 puntos; pT3–pT4: 3;
- ganglios residuales negativos: 0; positivos: 3;
- Ki-67 hasta 2,7 %: 0; hasta 19,7 %: 1; hasta 53,1 %: 2; por encima: 3;
- ER Allred 0–2: 3; Allred 3–8: 0.

Un total 0 se muestra como `PEPI 0`, 1–3 como `PEPI 1–3` y al menos 4 como
`PEPI ≥4`. El rango posible es 0–12. Ki-67 exige una medición fiable y
comparable. PEPI es pronóstico y no determina por sí solo una conducta
adyuvante.

## CTS5

Se preserva la categoría ganglionar 0 para N0, 1 para un ganglio, 2 para 2–3,
3 para 4–9 y 4 para al menos 10. El tamaño utilizado tiene un tope de 30 mm.

La fórmula conservada es:

`CTS5 = 0,438 × categoría ganglionar + 0,988 ×`

`(0,093 × tamaño − 0,001 × tamaño² + 0,375 × grado + 0,017 × edad)`

Un resultado menor de 3,13 es bajo; desde 3,13 hasta 3,86 inclusive es
intermedio; por encima de 3,86 es alto. Las bandas publicadas mostradas son
respectivamente `<5 %`, `5–10 %` y `>10 %` de recurrencia distante en los años
5–10.

El uso principal validado es en mujeres posmenopáusicas con cáncer de mama ER
positivo, libres de recurrencia después de cinco años de endocrinoterapia.
CTS5 es pronóstico y no predice directamente el beneficio de prolongar el
tratamiento. Puede requerir recalibración y exige cautela en premenopausia o
HER2 positivo.

### Redondeo heredado visible

La clasificación usa el valor bruto y el título muestra sólo dos decimales.
Por eso valores apenas por debajo y por encima de 3,13 pueden verse ambos como
`3,13`, pero uno es bajo y otro intermedio. Lo mismo ocurre alrededor de 3,86,
donde dos títulos `3,86` pueden pertenecer a intermedio y alto. Las pruebas
usan oráculos discretos a ambos lados de cada frontera.

El tamaño 30,0 y 30,1 mm produce el mismo score porque ambos se calculan con
30 mm; sólo cambia la nota que informa si se aplicó el tope.

## Seguridad

Las cuatro definiciones producen texto, métricas y notas tipadas. No incorporan
HTML crudo, `eval`, `Function`, acceso al DOM, `innerHTML` ni `outerHTML`. El
único enlace, correspondiente a RCB, se construye con el tipo seguro común y
valida protocolo HTTPS.

## Evidencia

- 139/139 pruebas doradas del inventario, motor y treinta y cinco calculadoras;
- formularios vacíos, ejemplos, selectores y restricciones de rango/paso;
- fórmula, categorías ganglionares y seis fronteras NPI;
- ejemplo, coherencia ganglionar, clases y defectos heredados RCB;
- componentes, umbrales, grupos y máximo PEPI;
- fórmula, categorías ganglionares, tope de tamaño y fronteras CTS5;
- enlace externo RCB tipado, HTTPS y sin marcado crudo;
- compilación Angular de producción;
- auditoría estática, de codificación y `git diff --check`.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 22
definiciones, el renderizador Angular visible, configuración institucional y
comparación visual/E2E antes de retirar la biblioteca anterior.
