# Corte Angular 015: función renal y riesgo agudo

## Objetivo

Este corte inicia la migración del módulo oncológico general e incorpora cuatro
herramientas al motor declarativo Angular:

1. Cockcroft–Gault y CKD-EPI 2021 en paralelo;
2. recuento absoluto de neutrófilos y grado CTCAE v6;
3. Khorana para riesgo tromboembólico venoso;
4. MASCC para complicaciones en neutropenia febril.

La biblioteca alcanza **27 de 57** definiciones portadas. Faltan 30
herramientas de los módulos oncológicos general, ginecológico,
digestivo/torácico y de radioterapia, además del renderizador Angular visible.

## Autoridad comparada

La fábrica canónica es
`herramientas/js/oncology-tools-general.js`; las fórmulas residen en
`herramientas/js/oncology-rules-general.js`. Se compararon ambas capas para no
confundir textos del formulario con reglas computacionales.

Los valores `value` de esa fábrica son ejemplos grises. No son datos clínicos
iniciales: números y selectores abren vacíos, mientras los checkbox abren
desmarcados. Esta diferencia se conserva explícitamente en el modelo Angular.

Los nombres bibliográficos visibles y los archivos de créditos/`NOTICE` sirven
como trazabilidad. No implican certificación, aval ni una licencia especial de
las organizaciones nombradas; tampoco existe un `LICENSE` raíz que permita
atribuir una licencia particular a estas reglas.

## Función renal oncológica

Cockcroft–Gault conserva edad, sexo, peso elegido y creatinina en mg/dL. El
factor por sexo es `0,85` para mujer y `1` para varón. La edad admitida por el
formulario es de 18 a 139 años.

CKD-EPI 2021 usa la ecuación de creatinina o, cuando se informa cistatina C, la
ecuación combinada creatinina–cistatina C. El resultado permanece indexado a
1,73 m². Sólo si se informa superficie corporal se agrega la GFR absoluta:

`eGFR × superficie corporal / 1,73`.

La salida muestra CrCl y eGFR juntas, pero advierte que no son intercambiables.
La herramienta no decide si Cockcroft–Gault debe usar peso real, ideal o
ajustado; tampoco resuelve creatinina inestable, sarcopenia, caquexia,
amputaciones o tamaño corporal extremo. Cerca de un umbral terapéutico debe
prevalecer el método requerido por protocolo o prospecto y considerarse una
medición más adecuada.

## ANC y CTCAE v6

El ANC se calcula como:

`leucocitos × 1000 × (segmentados + bandas) / 100`.

Se conservan los límites estrictos del motor anterior:

- menor de 100: grado 4;
- desde 100 y menor de 500: grado 3;
- desde 500 y menor de 1000: grado 2;
- desde 1000 y menor de 1500: grado 1;
- desde 1500: sin grado CTCAE.

Segmentados y bandas pueden valer individualmente hasta 100%, pero una suma
mayor de 100% produce el mensaje específico de datos incompletos.

### Defecto heredado visible

La clasificación usa el ANC sin redondear y el título usa `Math.round`. Por
eso un valor como 499,8 puede mostrarse como **500 células/µL** y conservar
**CTCAE grado 3**. Se documenta y prueba por paridad; antes de habilitar la
interfaz final debe decidirse si se muestra un decimal, se evita el redondeo o
se armoniza la clasificación.

El cálculo derivado no reemplaza un ANC informado directamente por el
laboratorio. Tampoco diagnostica neutropenia febril ni define por sí solo la
administración de un esquema.

## Khorana

Se conservaron todos los componentes y fronteras:

- estómago o páncreas: 2 puntos;
- pulmón, linfoma, ginecológico, vejiga o testículo: 1 punto;
- plaquetas `≥350 ×10⁹/L`: 1 punto;
- hemoglobina `<10 g/dL` o uso de estimulante eritropoyético: 1 punto total;
- leucocitos `>11 ×10⁹/L`: 1 punto;
- IMC `≥35 kg/m²`: 1 punto.

La clasificación original permanece: 0 bajo, 1–2 intermedio y al menos 3 alto.
La nota del producto conserva el umbral moderno de al menos 2 como inicio de
una evaluación clínica individual, no como indicación automática de
anticoagulación. El modelo corresponde al contexto ambulatorio antes de
quimioterapia sistémica y no incorpora por sí mismo riesgo hemorrágico,
interacciones o función renal.

La métrica «Componentes con puntos» cuenta factores positivos, no puntos. Por
eso un sitio de 2 puntos cuenta como un único componente y el máximo de 6
puntos contiene cinco componentes positivos.

## MASCC

La carga sintomática aporta 5, 3 o 0 puntos. Los factores protectores conservan
sus pesos: ausencia de hipotensión 5, ausencia de EPOC 4, tumor sólido o
neoplasia hematológica sin infección fúngica invasiva previa 4, ausencia de
deshidratación 3, inicio ambulatorio 3 y edad menor de 60 años 2.

El máximo es 26. Un total de al menos 21 se etiqueta bajo riesgo por MASCC;
20 o menos se etiqueta alto riesgo. La herramienta sólo corresponde después de
identificar neutropenia febril y nunca define por sí sola internación, vía
antibiótica o alta.

### Defectos heredados visibles

- El motor no verifica coherencia cruzada. Una carga «grave o moribundo» aporta
  cero, pero si se marcan todos los demás factores protectores el total es 21 y
  la salida dice bajo riesgo. La inestabilidad clínica debe prevalecer sobre el
  puntaje, como ya advierte el encabezado del formulario.
- Un checkbox desmarcado mezcla `no cumple` con `todavía no evaluado`. En MASCC
  esto reduce el puntaje y sesga hacia una clasificación más conservadora, pero
  no reemplaza una evaluación explícita.

Estas limitaciones no se corrigieron silenciosamente en un corte de paridad.

## Seguridad

Las cuatro definiciones producen sólo texto y métricas tipadas. No incorporan
HTML crudo, `eval`, `Function`, acceso al DOM, `innerHTML` ni `outerHTML`.

## Evidencia

- 107/107 pruebas doradas del inventario, motor y veintisiete calculadoras;
- formularios inicialmente vacíos, campos opcionales y validación de
  mínimos/máximos/pasos;
- Cockcroft–Gault por sexo, CKD-EPI por creatinina o combinada y desindexación;
- todos los límites ANC/CTCAE, suma diferencial y redondeo heredado;
- sitios, laboratorio, IMC, categorías y componentes Khorana;
- umbrales 20/21, máximo 26 y contradicción de carga grave en MASCC;
- compilación Angular de producción;
- auditoría estática, de codificación y `git diff --check`.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 30
definiciones, el renderizador Angular visible, configuración institucional y
comparación visual/E2E antes de retirar la biblioteca anterior.
