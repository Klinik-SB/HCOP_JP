# Corte Angular 011: riesgo prostático

## Objetivo

Este corte amplía el motor declarativo Angular con cuatro herramientas del bloque de próstata:

1. riesgo prostático EAU 2026 (ID histórico `damico`);
2. CAPRA / CAPRA-S;
3. Partin tables;
4. riesgo ganglionar Roach y referencia oficial Briganti/MSKCC.

La biblioteca alcanza **11 de 57** definiciones portadas. La interfaz visible de calculadoras continúa pendiente; este corte deja las reglas clínicas, formularios y pruebas listos para conectarlos al renderizador Angular final.

## Paridad del formulario

- Los números y selectores obligatorios abren vacíos y conservan los valores legacy sólo como ejemplos.
- Los checkbox abren desmarcados.
- CAPRA abre en pretratamiento porque `scenario=pre` era la selección efectiva del formulario anterior.
- Al elegir CAPRA-S se validan exclusivamente sus campos postoperatorios; los campos CAPRA ocultos no bloquean el cálculo.
- cT3b y cT4 son opciones válidas del formulario CAPRA, pero producen el resultado explícito fuera de modelo.

## Reglas comparadas

- EAU conserva la precedencia M1, falta de M0, enfermedad localmente avanzada, falta de cN0 y grupos localizado bajo/intermedio/alto.
- CAPRA conserva los umbrales exactos de edad, PSA, patrones Gleason, cT3a y 34% de cilindros positivos, con límite final 0-10.
- CAPRA-S conserva PSA, Gleason patológico, margen, extensión extraprostática, vesículas seminales y ganglios, sin recortar su máximo de 12.
- Partin prepara el perfil para las tablas oficiales y no inventa porcentajes locales.
- Roach usa `(2 / 3) * PSA + 10 * (Gleason - 6)`. Un valor fuera de 0-100% se informa sin recorte silencioso.
- Briganti/MSKCC se ofrece sólo mediante una referencia oficial; no se reemplaza por una fórmula aproximada.

## Seguridad y estructura

`frontend/src/app/features/tools/calculators/` incorpora:

- `legacy-calculators-08-11.definitions.ts`, con formularios y reglas tipadas;
- validación declarativa por escenario en `calculator.engine.ts`;
- enlaces externos HTTPS como objetos tipados en `calculator.models.ts`;
- registro e inventario actualizados a once herramientas;
- pruebas doradas literales para casos normales, umbrales, precedencias, extremos y errores.

Las referencias externas no insertan HTML crudo y el motor no ejecuta expresiones dinámicas.

## Evidencia

- 38/38 pruebas doradas del inventario, motor y once calculadoras;
- compilación Angular de producción correcta;
- auditoría estática sin ejecución dinámica ni escritura directa de HTML;
- `git diff --check` sin errores.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 46 definiciones, el renderizador Angular visible, la aplicación de configuración institucional y la comparación visual/E2E antes de retirar la ruta anterior.
