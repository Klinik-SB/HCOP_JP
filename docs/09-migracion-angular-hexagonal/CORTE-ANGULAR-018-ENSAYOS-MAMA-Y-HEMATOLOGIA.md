# Corte Angular 018: ensayos de mama y hematología

## Alcance

Este corte incorpora las últimas cuatro herramientas del módulo oncológico
general al motor declarativo Angular:

1. criterios reconstruidos de la cohorte 1 de monarchE;
2. criterios históricos reconstruidos de OlympiA y CPS+EG;
3. International Prognostic Index (IPI);
4. R2-ISS para mieloma múltiple.

La biblioteca alcanza **39 de 57** definiciones portadas. Faltan 18
herramientas de los módulos ginecológico, digestivo/torácico y de radioterapia,
además del renderizador Angular visible.

## Autoridad y formulario

La autoridad de paridad fue
`herramientas/js/oncology-tools-general.js` para formularios y salidas, junto
con `herramientas/js/oncology-rules-general.js` para reglas y fronteras.

Todos los números y selectores abren vacíos, salvo el selector de escenario de
OlympiA, que conserva el valor real `neo_hr` porque la fábrica anterior lo
marcaba explícitamente como predeterminado. Los valores restantes se conservan
como ejemplos grises y los checkbox abren desmarcados.

Se preservaron orden, etiquetas, opciones, mínimos, máximos, pasos, textos de
alcance, campos anchos y validación por escenario. Los campos de OlympiA que no
pertenecen al escenario activo se ignoran incluso si contienen un valor no
válido; al cambiar de escenario, solamente se exigen y validan sus variables.

Las fuentes y archivos de créditos/`NOTICE` sirven como trazabilidad y no
implican certificación, aval ni licencia especial de las organizaciones
nombradas. No existe un `LICENSE` raíz que permita atribuir una licencia
particular a estas reglas.

## monarchE, cohorte 1

El alcance biológico requiere simultáneamente:

- receptores hormonales positivos;
- HER2 negativo;
- enfermedad temprana no metastásica.

La anatomía de alto riesgo se cumple con al menos cuatro ganglios axilares
positivos o con uno a tres ganglios y, además, grado 3 o tamaño tumoral de al
menos 50 mm. N0 nunca cumple la anatomía reconstruida, aunque el tumor sea de
50 mm y grado 3. Se probaron las fronteras N0/N1, N3/N4, 49,9/50 mm y grado
2/3.

Ki-67 no es requerido por la cohorte 1 reconstruida. La revisión de autoridad
clínica confirmó que los criterios de cohorte 1 y el retiro del requisito de
Ki-67 son coherentes con la actualización regulatoria de 2023 y el etiquetado
de referencia posterior. La pantalla, sin embargo, reproduce criterios de
cohorte: no representa toda elegibilidad regulatoria, temporal o clínica y no
constituye una indicación automática.

### Limitación heredada

Los tres datos biológicos son checkbox. Desmarcado representa tanto `No` como
`desconocido/no evaluado`; por eso un dato ausente se interpreta como fuera de
alcance. Antes de usar el resultado deben verificarse los informes originales.

## OlympiA y CPS+EG

Todos los escenarios exigen como alcance basal una variante germinal
patogénica o probablemente patogénica BRCA1/2 y HER2 negativo. El resultado
final sólo coincide cuando ese alcance y el criterio de alto riesgo del
escenario están presentes.

### Neoadyuvancia HR positiva

CPS+EG suma:

- grupo clínico I–IIA: 0; IIB–IIIA: 1; IIIB–IIIC: 2;
- grupo patológico 0–I: 0; IIA–IIIB: 1; IIIC: 2;
- ER negativo: 1;
- grado nuclear 3: 1.

El rango es 0–6. El criterio reconstruido exige enfermedad invasiva residual y
CPS+EG al menos 3. Un CPS+EG de 6 sin enfermedad residual no cumple. Se
probaron ambos lados de 3 y el máximo de 6.

### Otros escenarios

- neoadyuvancia triple negativa: exige enfermedad invasiva residual;
- cirugía inicial/adyuvancia triple negativa: cumple con algún ganglio
  positivo o, si es N0, con tamaño al menos 2 cm;
- cirugía inicial/adyuvancia HR positiva: exige al menos cuatro ganglios
  positivos.

En los escenarios que no usan CPS+EG, el resultado muestra `No aplica`. La
herramienta reconstruye criterios históricos de un ensayo. Deben verificarse
subtipo, estadio, tratamiento previo, temporalidad, genética y la información
regulatoria vigente; una etiqueta histórica puede no ser la versión actual.
Coincidir no constituye una indicación automática de tratamiento.

### Defecto heredado visible

El tamaño del escenario adyuvante triple negativo declara mínimo `0,01` cm y
paso `0,1` cm. El umbral y ejemplo exacto `2,00` cm no pertenece a la progresión
`0,01 + n × 0,1`, por lo que el formulario lo rechaza como incremento inválido.
Los valores válidos cercanos `1,91` y `2,01` quedan respectivamente debajo y
encima del umbral. Se conserva y prueba esta contradicción por paridad; no debe
corregirse silenciosamente.

Como en monarchE, los checkbox desmarcados de gBRCA, HER2 y enfermedad residual
no distinguen un resultado negativo de un dato desconocido.

## International Prognostic Index

El IPI clásico suma un punto por cada factor:

- edad mayor de 60 años;
- estadio Ann Arbor III–IV;
- LDH por encima del límite superior normal;
- ECOG al menos 2;
- más de un sitio extranodal.

Los límites son estrictos: 60 años, estadio II, ECOG 1 y un sitio extranodal no
suman; 61 años, estadio III, ECOG 2 y dos sitios sí. El formulario canónico
acepta edad 0 por declarar mínimo 0, un comportamiento heredado no clínico que
queda probado y documentado.

Los grupos son bajo con 0–1, bajo-intermedio con 2, alto-intermedio con 3 y
alto con 4–5. El IPI fue desarrollado en linfomas no Hodgkin agresivos; la
calibración absoluta cambia por subtipo y era terapéutica. No reemplaza
NCCN-IPI, CNS-IPI ni la clasificación biológica, y no selecciona por sí solo un
régimen.

LDH desmarcado representa tanto un valor normal como un análisis no informado;
el usuario debe confirmar que fue medido antes de interpretar el puntaje.

## R2-ISS

El ISS basal derivado conserva:

- ISS I: β2-microglobulina menor de 3,5 mg/L y albúmina al menos 3,5 g/dL;
- ISS III: β2-microglobulina al menos 5,5 mg/L;
- ISS II: las combinaciones restantes.

Se probaron las fronteras 3,49/3,50 y 5,49/5,50 de β2-microglobulina, además de
3,49/3,50 de albúmina.

Los pesos R2-ISS son 0 para ISS I, 1 para ISS II, 1,5 para ISS III, 1 por
del(17p), 1 por LDH alto, 1 por t(4;14) y 0,5 por ganancia o amplificación 1q.
El total 0 es R2-ISS I; más de 0 y hasta 1 es II; más de 1 y hasta 2,5 es III;
por encima de 2,5 es IV. Las pruebas cubren 0, 0,5, 1, 1,5, 2,5 y 3, además del
máximo 5.

La verificación primaria confirmó que pesos, rangos y población corresponden a
R2-ISS de European Myeloma Network para mieloma múltiple recién diagnosticado.
Es pronóstico poblacional y no define tratamiento, trasplante ni mantenimiento.

### Riesgo de infraestadificación heredado

del(17p), LDH alto, t(4;14) y 1q son checkbox. Desmarcado no distingue un
resultado negativo de un estudio FISH/LDH faltante. Calcular sin estudios
citogenéticos adecuados puede infraestadificar. Deben documentarse calidad y
sensibilidad de FISH, umbral de del(17p) y disponibilidad de 1q.

## Seguridad

Las cuatro definiciones producen exclusivamente texto y métricas tipadas. No
incorporan HTML crudo, enlaces, `eval`, `Function`, acceso al DOM, `innerHTML`
ni `outerHTML`.

## Evidencia

- 158/158 pruebas doradas del inventario, motor y treinta y nueve calculadoras;
- formularios vacíos, ejemplos y escenario inicial real de OlympiA;
- validación aislada por cada escenario OlympiA;
- alcance biológico y fronteras anatómicas de monarchE;
- CPS+EG 2/3, máximo 6 y cuatro escenarios OlympiA;
- cinco factores, grupos, severidades y máximo IPI;
- ISS derivado, pesos, estadios y máximo R2-ISS;
- defectos y ambigüedades heredados explícitamente probados;
- compilación Angular de producción;
- auditoría estática, de codificación y `git diff --check`.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 18
definiciones, el renderizador Angular visible, configuración institucional y
comparación visual/E2E antes de retirar la biblioteca anterior.
