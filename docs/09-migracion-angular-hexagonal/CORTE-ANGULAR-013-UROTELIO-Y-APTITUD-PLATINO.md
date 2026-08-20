# Corte Angular 013: urotelio y aptitud para platino

## Objetivo

Este corte amplía el motor declarativo Angular con cuatro herramientas del bloque de vejiga y urotelio:

1. NMIBC por modelos EAU, EORTC y CUETO;
2. revisión adyuvante post-cistectomía;
3. aptitud para cisplatino y para cualquier tratamiento basado en platinum;
4. estratificación UTUC EAU 2026.

La biblioteca alcanza **19 de 57** definiciones portadas. El renderizador visible continúa pendiente; las reglas, formularios, mensajes y salidas quedan tipados y disponibles para conectarlos sin depender del JavaScript legacy.

## Paridad de formularios

- Solamente el selector `scenario` de NMIBC conserva `eau` como valor inicial real.
- Los demás números y selectores abren vacíos. Sus valores legacy son ejemplos y no datos clínicos precargados.
- Los checkbox abren desmarcados y nunca son obligatorios por el validador genérico.
- Al cambiar el modelo NMIBC, sólo se validan los campos visibles de EAU, EORTC o CUETO.
- Se conservaron opciones, mínimos, máximos, pasos, ayudas, orden y textos de las cuatro fichas.

## Reglas comparadas

### NMIBC EAU

Los sistemas WHO 2004/2022 y WHO 1973 permanecen separados y exigen un grado compatible. Los tres factores clínicos conservan sus fronteras exactas:

- edad mayor de 70 años;
- más de un tumor;
- tamaño de al menos 3 cm.

La presentación recurrente obtiene grupo pero no probabilidades de la tabla de tumores primarios. LVI, CIS prostático o variante agresiva llevan a muy alto riesgo sin probabilidades; el CIS puro primario lleva a alto riesgo sin probabilidades. Las tablas y la lógica son reglas derivadas conservadas del producto previo, no un algoritmo EAU oficial certificado.

### EORTC y CUETO

EORTC conserva por separado puntajes y bandas de recurrencia/progresión de la cohorte histórica. CUETO no muestra probabilidades hasta confirmar expresamente la cohorte tratada con 12 instilaciones de BCG durante 5–6 meses. Se verificaron todos los cambios de banda y los límites de edad de 60 y más de 70 años.

Estos porcentajes pertenecen a cohortes históricas y no se mezclan con el grupo EAU contemporáneo.

### Post-cistectomía

La herramienta sigue siendo una lista determinística de disparadores, no una predicción individual de recurrencia. Conserva:

- exclusión de M1 y advertencias por M no confirmado o pNx;
- quimioterapia adyuvante con cisplatino en alto riesgo sin neoadyuvancia, si el paciente es apto y acepta;
- evaluación de nivolumab después de neoadyuvancia o cuando cisplatino no es posible/aceptado;
- consideración de radioterapia desde pT3b, N positivo o margen positivo;
- precedencia del protocolo cuando ya se utilizó un esquema perioperatorio moderno.

### Cisplatino y platinum

La regla heredada considera no aptitud para cisplatino convencional con GFR **≤60 ml/min**; por ello, exactamente 60 también queda fuera. La clasificación local de no aptitud para todo platinum usa GFR menor de 30, ECOG mayor de 2, combinación ECOG 2 con GFR menor de 60 o comorbilidad severa. Es una heurística del producto previo y no debe presentarse como reproducción literal o certificada de un consenso externo.

El método renal se conserva como dato descriptivo y métrica, pero no modifica el cálculo. La salida heredada mantiene la etiqueta genérica «Función renal», aun cuando el método seleccionado sea CrCl o eGFR. La zona 40–60 ml/min conserva la advertencia de medición formal.

### UTUC

Un criterio fuerte —citología o biopsia high-grade, invasión local en TC o variante agresiva— clasifica alto riesgo antes de evaluar datos faltantes. Tamaño ≥2 cm, multifocalidad e hidroureteronefrosis permanecen como factores débiles y, aislados, no convierten una lesión low-grade/no invasiva en alto riesgo.

La validación genérica heredada todavía exige completar tamaño, focalidad, citología, biopsia y TC aun cuando se selecciona M1. Sólo después muestra que el caso está fuera del módulo local. Esta fricción se documenta para una decisión funcional posterior y no se corrige silenciosamente dentro del port.

## Seguridad

Las cuatro definiciones sólo producen texto y métricas tipadas. No incorporan HTML crudo, ejecución dinámica, `eval`, `Function`, `innerHTML` ni acceso directo al DOM.

## Evidencia

- 71/71 pruebas doradas del inventario, motor y diecinueve calculadoras;
- formularios inicialmente vacíos, escenarios activos, opciones inválidas y límites del navegador;
- ramas WHO 2004/2022 y WHO 1973, factores especiales y ausencia intencional de probabilidades;
- todas las bandas EORTC y CUETO;
- puertas de adyuvancia, función renal, performance, comorbilidad y criterios UTUC;
- compilación Angular de producción;
- auditoría estática, de codificación y `git diff --check`.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 38 definiciones, el renderizador Angular visible, configuración institucional y comparación visual/E2E antes de retirar la ruta anterior.
