# Corte Angular 016: riesgo agudo, paliativos y radioterapia

## Objetivo

Este corte incorpora cuatro herramientas adicionales del módulo oncológico
general al motor declarativo Angular:

1. CISNE para neutropenia febril inicialmente estable;
2. Palliative Prognostic Index (PPI);
3. BED y EQD2 por modelo lineal-cuadrático;
4. QT corregido por Fridericia.

La biblioteca alcanza **31 de 57** definiciones portadas. Faltan 26
herramientas de los módulos oncológicos general, ginecológico,
digestivo/torácico y de radioterapia, además del renderizador Angular visible.

## Autoridad y formulario

La autoridad comparada fue
`herramientas/js/oncology-tools-general.js` para formularios y salidas, junto
con `herramientas/js/oncology-rules-general.js` para fórmulas y fronteras.

Todos los números y selectores abren vacíos. Sus valores `value` se conservan
sólo como ejemplos grises; los checkbox abren desmarcados. Se preservaron
orden, etiquetas, opciones, mínimos, máximos, pasos, ayudas y el título corto
`BED y EQD2` utilizado por los selectores compactos.

Las fuentes y archivos de créditos/`NOTICE` sirven como trazabilidad y no
implican certificación, aval ni licencia especial de las organizaciones
nombradas. No existe un `LICENSE` raíz que permita atribuir una licencia
particular a estas reglas.

## CISNE

CISNE se mantiene restringido a adultos con tumor sólido, neutropenia febril y
estabilidad clínica inicial. No debe usarse ante disfunción orgánica,
alteraciones vitales, infección mayor evidente, neoplasia hematológica,
trasplante o quimioterapia de alta intensidad.

Se conservaron los puntos:

- ECOG al menos 2: 2;
- hiperglucemia de estrés: 2;
- EPOC, enfermedad cardiovascular, mucositis grado al menos 2 y monocitos por
  debajo de 200/µL: 1 cada uno.

La hiperglucemia usa un umbral de `121 mg/dL` sin diabetes/corticoides y de
`250 mg/dL` cuando alguno está presente. Los límites son inclusivos. Un total
de 0 es clase I baja, 1–2 clase II intermedia y al menos 3 clase III alta; el
máximo es 8.

### Limitación heredada

Diabetes o corticoides no suman puntos directamente: sólo elevan el umbral.
Por eso una glucemia de 121 mg/dL suma 2 sin esa casilla y vuelve a 0 al
marcarla. Es la conducta canónica, pero resulta contraintuitiva si el usuario
desconoce la definición de hiperglucemia de estrés. Los checkbox tampoco
distinguen ausencia de factor de `no evaluado`.

CISNE busca evitar una falsa clasificación de bajo riesgo; no debe retrasar
antibióticos ni decidir automáticamente internación o manejo ambulatorio.

## Palliative Prognostic Index

El puntaje conserva:

- PPS hasta 20: 4 puntos; PPS 30–50: 2,5; PPS desde 60: 0;
- ingesta moderadamente reducida: 1; severamente reducida: 2,5;
- edema: 1; disnea en reposo: 3,5; delirium: 4.

Los cortes son estrictos: un total exactamente 4 todavía no cruza el primer
punto; más de 4 y hasta 6 conserva la lectura poblacional de supervivencia
menor de seis semanas; sólo más de 6 cruza la lectura de tres semanas. El rango
posible es 0–15.

Estas lecturas describen cohortes y no predicen una fecha individual. El motor
no modela salvedades por nutrición parenteral ni determina si la ingesta
reducida es reversible. El delirium por medicación, infección o alteración
metabólica requiere interpretación independiente. PPI no debe usarse aislado
para limitar estudios, hidratación, derivación o tratamiento.

## BED y EQD2

El modelo conserva:

`D = número de fracciones × dosis por fracción`

`BED = D × (1 + dosis por fracción / α/β)`

`EQD2 = BED / (1 + 2 / α/β)`

Las fracciones deben ser enteras positivas; la dosis por fracción y `α/β`
deben ser positivos. El ejemplo 25 × 2 Gy con `α/β=10` produce dosis total 50
Gy, BED 60 Gy y EQD2 50 Gy.

Una dosis por fracción exactamente 5 Gy conserva severidad informativa; la
advertencia aparece sólo cuando es mayor de 5. El resultado depende por
completo del `α/β` elegido y no incorpora repoblación, reparación incompleta,
tiempo total, heterogeneidad, recuperación tisular ni reirradiación. Es una
aproximación y no una prescripción o límite automático de órgano a riesgo.

## QTc Fridericia

Se preservan las fórmulas:

`RR = 60 / frecuencia cardíaca`

`QTcF = QT / raíz cúbica de RR`

El límite de referencia es 460 ms para mujer y 450 ms para varón. La igualdad
permanece dentro de referencia; sólo un valor mayor aparece sobre referencia.
Desde 480 ms se muestra la banda 480–499 y desde 500 ms la banda de mayor
riesgo. El QTc basal es opcional y, cuando se informa, muestra un delta con
signo y redondeado al milisegundo.

### Defecto heredado visible

La banda y severidad se determinan con el QTcF sin redondear, pero el título se
muestra sin decimales. En consecuencia:

- QT 458 ms y FC 69 puede mostrar `QTcF 480 ms` y seguir en severidad
  informativa, porque el valor real aún es menor de 480;
- QT 477 ms y FC 69 puede mostrar `QTcF 500 ms` y conservar la banda 480–499,
  porque el valor real aún es menor de 500.

Esta incoherencia queda probada por paridad. Antes de habilitar la interfaz
final deberá decidirse si se muestra un decimal o se armoniza el redondeo, sin
alterar silenciosamente la clasificación.

QRS ancho, marcapasos, fibrilación auricular o un trazado dudoso requieren
interpretación especializada. La herramienta no indica suspensión automática
de un fármaco.

## Seguridad

Las cuatro definiciones producen exclusivamente texto y métricas tipadas. No
incorporan HTML crudo, `eval`, `Function`, acceso al DOM, `innerHTML` ni
`outerHTML`.

## Evidencia

- 124/124 pruebas doradas del inventario, motor y treinta y una calculadoras;
- formularios vacíos, ejemplos, campos opcionales, selectores y restricciones;
- umbrales de glucemia, componentes, clases y máximo CISNE;
- componentes y cortes estrictos 4/4,5/6/6,5 de PPI;
- oráculos convencionales e hipofraccionados, integridad y advertencia BED;
- referencias por sexo, bandas, delta y redondeo heredado QTcF;
- compilación Angular de producción;
- auditoría estática, de codificación y `git diff --check`.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 26
definiciones, el renderizador Angular visible, configuración institucional y
comparación visual/E2E antes de retirar la biblioteca anterior.
