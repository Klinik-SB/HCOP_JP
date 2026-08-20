# Corte Angular 020: ovario y nódulo pulmonar

## Alcance

Este corte incorpora al motor declarativo Angular cuatro herramientas que
provienen de los módulos canónicos de ginecología y tórax:

1. Fagotti PIV clásico de 2006;
2. AGO score y población DESKTOP III en primera recaída de ovario;
3. Brock/PanCan completo para nódulo pulmonar;
4. Mayo-Herder con la categoría visual de PET-FDG.

La biblioteca alcanza **47 de 57** definiciones portadas. Permanecen pendientes
diez herramientas digestivas, torácicas y de radioterapia, además del
renderizador Angular visible de la biblioteca completa.

## Autoridad y formularios

Fagotti y AGO se compararon con
`herramientas/js/oncology-tools-gyne.js` y
`herramientas/js/oncology-rules-gyne.js`. Brock y Mayo-Herder se compararon con
`herramientas/js/oncology-tools-gi-thorax.js` y
`herramientas/js/oncology-rules-gi-thorax.js`.

Se conservaron IDs, títulos, categorías, orden de campos, etiquetas, ayudas,
opciones, obligatoriedad, mínimos, máximos y pasos. Los formularios abren
vacíos. Los valores 62/8/1 de Brock y 65/12 de Mayo-Herder son únicamente
ejemplos visuales y no datos clínicos precargados.

También se preservó un detalle de interfaz del origen: los selectores AGO
muestran `Sí` antes de `No`, mientras los selectores binarios de tórax muestran
`No` antes de `Sí`.

## Fagotti PIV clásico

Cada una de las siete definiciones vale dos puntos. Las seis casillas describen
carcinomatosis peritoneal, diafragma, mesenterio, omento, intestino y estómago.
La séptima definición se activa solamente si la mayor lesión superficial
hepática es **mayor de 2 cm**. Dos centímetros exactos no suman; 2,1 cm sí.

El umbral histórico es inclusivo: `PIV >=8`. Las pruebas cubren 6/8 puntos, el
máximo 14/14 y cada componente independiente.

### Semántica heredada

Una casilla desmarcada se interpreta como ausencia del hallazgo, no como dato
desconocido. La interfaz final debe explicitar esa decisión para evitar que una
evaluación incompleta parezca negativa.

El umbral histórico predice riesgo de citorreducción subóptima con la definición
de residuo mayor de 1 cm. No equivale a irresecabilidad ni sustituye la
evaluación de un centro experto.

## AGO / DESKTOP III

La regla primero confirma:

- primera recaída;
- intervalo libre de platino de al menos 6 meses.

Si cualquiera falla, la salida queda fuera de la población DESKTOP III y no
exige completar el score. Las fronteras 5,9/6 meses están verificadas.

En población aplicable, AGO positivo exige simultáneamente:

- ECOG 0;
- ascitis menor de 500 ml;
- resección macroscópica completa en la cirugía inicial.

La frontera de ascitis es estricta: 499 ml cumple y 500 ml no. Un AGO positivo
identifica mayor probabilidad de resección completa, pero no garantiza
resecabilidad, beneficio individual ni una indicación quirúrgica automática.

### Limitaciones preservadas

- el origen no ofrece una alternativa específica para FIGO I/II;
- los tres componentes aparecen visibles aunque el caso ya esté fuera de la
  población;
- por la validación declarativa global, un valor opcional visible pero inválido
  puede ser rechazado antes del cortocircuito clínico, aun cuando AGO no sea
  aplicable.

Esta última conducta está cubierta por una prueba y debe reconsiderarse junto
con el diseño visible, no modificarse silenciosamente en la fórmula.

## Brock / PanCan

Se conserva el predictor lineal completo publicado, incluida la transformación
no lineal del diámetro y los coeficientes de sexo, antecedente familiar,
enfisema, tipo de nódulo, lóbulo superior, cantidad de nódulos y espiculación.
La probabilidad se obtiene mediante una logística numéricamente estable.

El caso dorado de 62 años, varón, nódulo sólido de 8 mm, un nódulo y factores
negativos produce **1,7157809 %**, mostrado como 1,7 %, con predictor lineal
-4,0480. Se probaron también los tres tipos de nódulo y cada coeficiente por
separado.

### Extrapolación heredada

La cohorte de desarrollo corresponde a 50–75 años. El formulario, sin embargo,
acepta de 18 a 120 años y sólo agrega una advertencia fuera de 50–75. También
acepta diámetros de 0,1 a 30 mm y cualquier cantidad entera de nódulos desde 1,
sin máximo declarado. Se conservaron esas fronteras para paridad; no deben
interpretarse como validación externa en todos esos extremos.

Brock es un modelo de cribado. Su calibración puede variar en nódulos
incidentales y poblaciones con otra prevalencia; no confirma histología ni
selecciona por sí solo una conducta.

## Mayo-Herder con PET-FDG

Primero se calcula Mayo con edad, tabaquismo, antecedente de cáncer
extratorácico de más de cinco años, diámetro, espiculación y lóbulo superior.
Herder usa esa probabilidad como decimal entre 0 y 1 —no como porcentaje— y
agrega el coeficiente PET:

| Captación PET | Coeficiente | Herder del caso dorado |
|---|---:|---:|
| Ausente | 0,000 | 1,0786 % |
| Tenue | 2,322 | 10,0051 % |
| Moderada | 4,617 | 52,4567 % |
| Intensa | 4,771 | 56,2754 % |

El caso dorado usa 65 años, 12 mm y factores negativos; Mayo pretest es
5,9698 %. La prueba de frontera confirma que 10 mm agrega la advertencia de
menor sensibilidad de PET-FDG y 10,1 mm no.

### Limitaciones preservadas

El selector de antecedente sólo pregunta si existió cáncer extratorácico hace
más de cinco años. La respuesta `No` mezcla ausencia de antecedente con un
antecedente más reciente; no existe una tercera opción en la fuente. La baja
sensibilidad de PET en nódulos de 10 mm o menos genera una advertencia, pero no
bloquea el cálculo.

La escala PET es visual y puede perder especificidad en procesos inflamatorios
o granulomatosos. El resultado es probabilístico, no diagnóstico ni indicación
de tratamiento.

## Seguridad y evidencia

Las cuatro definiciones producen exclusivamente texto y métricas tipadas. No
incorporan HTML crudo, `eval`, `Function`, acceso al DOM, `innerHTML` ni
`outerHTML`.

El corte queda respaldado por:

- **196/196** pruebas doradas del inventario, motor y cuarenta y siete
  calculadoras;
- fronteras 2/2,1 y 6/8 de Fagotti;
- fronteras 5,9/6 meses y 499/500 ml de AGO;
- fórmula, tipos, factores y advertencias 49/50/75/76 de Brock;
- Mayo pretest, cuatro coeficientes PET y frontera 10/10,1 mm;
- orden canónico diferenciado de selectores `Sí/No`;
- auditoría diferencial independiente de 30.587 casos más cuatro controles de
  metadata, sin diferencias en el recorrido público;
- compilación TypeScript, build Angular de producción, auditoría estática y
  `git diff --check`.

## Estado pendiente

La fila general de Calculadoras permanece `Pendiente`. Faltan diez definiciones,
el renderizador Angular visible, configuración institucional, comparación
visual/E2E y validación de permisos antes de retirar la biblioteca anterior.
