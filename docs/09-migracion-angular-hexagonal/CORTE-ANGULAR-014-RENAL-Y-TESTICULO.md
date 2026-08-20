# Corte Angular 014: complejidad renal y pronóstico testicular

## Objetivo

Este corte incorpora al motor declarativo Angular las últimas cuatro
herramientas que estaban definidas directamente en `herramientas/js/app.js`:

1. RENAL nephrometry y PADUA como escalas anatómicas independientes;
2. Leibovich 2003 y el resumen UISS localizado;
3. IMDC para carcinoma renal metastásico;
4. IGCCCG para tumores germinales metastásicos.

La biblioteca alcanza **23 de 57** definiciones portadas. Con esto queda
trasladado todo el bloque canónico de `app.js`; faltan las 34 herramientas de
los módulos oncológicos y de radioterapia, además del renderizador Angular
visible.

## Paridad de formularios

- `scenario` conserva como selección real inicial `renal` o `leibovich`.
- Los demás números y selectores abren vacíos. Los valores que mostraba el
  producto anterior se conservan exclusivamente como ejemplos.
- Los checkbox abren desmarcados y no son obligatorios.
- Sólo se validan los campos del escenario RENAL/PADUA o Leibovich/UISS que se
  encuentra visible.
- Orden, etiquetas, opciones, ayudas, mínimos y pasos permanecen iguales al
  contrato canónico.
- IMDC no posee entradas obligatorias: enviar sus seis casillas desmarcadas
  produce cero factores y grupo favorable, tal como en el producto anterior.

## Reglas comparadas

### RENAL y PADUA

RENAL conserva los bordes de tamaño `≤4`, `<7` y `≥7 cm`; suma R, E, N y L,
informa la cara `a/p/x` y agrega `h` como sufijo sin puntos. Sus grupos son
4–6 bajo, 7–9 moderado y 10–12 alto.

PADUA conserva `≤4`, `≤7` y `>7 cm`, suma seis componentes y mantiene la cara
como descriptor. Sus grupos son 6–7 bajo, 8–9 moderado y al menos 10 alto.
Ambas salidas describen complejidad anatómica: no estiman malignidad,
complicaciones ni una conducta terapéutica por sí solas.

### Leibovich 2003 y UISS

Leibovich conserva exactamente los puntos de pT, pN positivo, tamaño de al
menos 10 cm, grado y necrosis. Los límites son 0–2 bajo, 3–5 intermedio y 6 o
más alto. Sólo corresponde al ccRCC M0 operado.

El resumen UISS permanece separado. Clasifica bajo a pT1, grado hasta 2 y ECOG
0; alto a pT3 con grado al menos 2 y ECOG al menos 1, o a cualquier pT4. N+
o M1 se informa fuera de este resumen localizado. Por paridad, todos los
resultados UISS conservan severidad visual informativa, incluso el grupo alto.

El grado de Leibovich 2003 es históricamente Fuhrman. El selector heredado sólo
dice `Grado`; no debe interpretarse automáticamente como equivalencia con
WHO/ISUP actual. Tampoco se muestran porcentajes locales no calibrados.

### IMDC

Se cuentan KPS menor de 80%, intervalo diagnóstico-tratamiento menor de un año,
hemoglobina baja, calcio corregido alto, neutrófilos altos y plaquetas altas.
Cero factores es favorable, uno o dos intermedio y tres a seis pobre.

El formulario heredado no distingue una casilla negativa de un factor todavía
no evaluado. En consecuencia, una ficha vacía también resulta favorable. Esta
limitación queda explícita y deberá resolverse antes de habilitar la herramienta
visible; IMDC estratifica pronóstico y no selecciona por sí solo un régimen.

### IGCCCG

El grupo de marcadores conserva los límites exactos:

- S3: AFP `>10000`, hCG `>50000` o LDH `>10 × LSN`;
- S2: AFP `≥1000`, hCG `≥5000` o LDH `≥1,5 × LSN`, sin criterio S3;
- S1: valores inferiores a esos límites.

En seminoma, AFP exactamente igual al límite superior normal sigue siendo
válida y sólo un valor mayor impide clasificarlo como seminoma puro. Metástasis
visceral no pulmonar lleva al grupo intermedio. LDH mayor de `2,5 × LSN`
conserva la advertencia contemporánea sin cambiar el grupo clásico bueno.

En no seminoma, primario mediastinal, metástasis visceral no pulmonar o S3
determinan pronóstico desfavorable; S2 determina intermedio. Un sitio `otro`
sin criterio desfavorable no entra en la clasificación clásica, pero sí puede
clasificarse como desfavorable cuando existe uno de esos criterios.

La salida conserva el grupo clásico y resultados poblacionales contemporáneos.
No implementa el modelo granular actualizado para no seminoma basado en edad,
LDH y metástasis pulmonares, ni presenta porcentajes como predicción individual.
La regla heredada también etiqueta toda banda baja como `S1`, incluso con
marcadores normales: no recibe un LSN de hCG ni distingue el `S0` de la
estadificación UICC. La métrica `S` debe leerse como banda pronóstica interna de
esta herramienta, no como una estadificación UICC exacta.

## Autoridad y limitaciones heredadas

La autoridad computacional comparada fue `herramientas/js/app.js` junto con
`herramientas/js/clinical-rules.js`. Las páginas HTML numeradas 17–20 son fichas
históricas de referencia, no contienen la implementación canónica y no se
usaron para cambiar fórmulas ni textos. Entre sus divergencias, la ficha 17 no
implementa PADUA; la 18 todavía nombra SSIGN; la 19 mezcla IMDC con
MSKCC/Motzer; y la 20 precarga valores y no contempla el LSN de AFP ni todos los
sitios primarios que sí maneja el contrato canónico actual.

Las fuentes visibles y los archivos `NOTICE`/créditos se preservan como
trazabilidad bibliográfica. No implican aval, certificación ni licencia especial
de las organizaciones nombradas. Tampoco existe un archivo `LICENSE` en la raíz
que autorice atribuir una licencia particular a estas cuatro reglas.

Los checkbox pN+ y necrosis de Leibovich, igual que los factores IMDC, todavía
mezclan `no` con `no evaluado`. Esta ambigüedad no se corrigió silenciosamente
durante el port.

## Seguridad

Las cuatro definiciones sólo producen texto y métricas tipadas. No incorporan
HTML crudo, ejecución dinámica, `eval`, `Function`, `innerHTML`, `outerHTML` ni
acceso directo al DOM.

## Evidencia

- 89/89 pruebas doradas del inventario, motor y veintitrés calculadoras;
- escenarios activos, formularios inicialmente vacíos, opciones inválidas,
  mínimos y pasos;
- totales y fronteras RENAL/PADUA, Leibovich/UISS e IMDC;
- todos los límites S1/S2/S3, AFP frente a su LSN, seminoma, no seminoma,
  sitios primarios y metástasis viscerales de IGCCCG;
- compilación Angular de producción;
- auditoría estática, de codificación y `git diff --check`.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 34
definiciones, el renderizador Angular visible, configuración institucional y
comparación visual/E2E antes de retirar la ruta anterior.
