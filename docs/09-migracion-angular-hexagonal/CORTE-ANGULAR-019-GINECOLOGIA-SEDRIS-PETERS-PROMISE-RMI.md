# Corte Angular 019: Sedlis, Peters, ProMisE y RMI I

## Alcance

Este corte incorpora las primeras cuatro herramientas del módulo ginecológico
al motor declarativo Angular:

1. criterios de Sedlis después de cirugía radical de cuello uterino;
2. criterios de Peters de alto riesgo posoperatorio;
3. clasificación molecular ProMisE / ESGO 2025 y refinamiento NSMP;
4. Risk of Malignancy Index I para una masa anexial.

La biblioteca alcanza **43 de 57** definiciones portadas. Faltan 14
herramientas de los módulos ginecológico, digestivo/torácico y de radioterapia,
además del renderizador Angular visible.

## Autoridad y formularios

Los nombres reales de las fuentes canónicas son
`herramientas/js/oncology-tools-gyne.js` y
`herramientas/js/oncology-rules-gyne.js`. Los IDs estables confirmados contra el
inventario son `gyne-sedlis`, `gyne-peters`, `gyne-promise` y `gyne-rmi-i`.

Todos los números y selectores abren vacíos porque estas cuatro fábricas no
declaran valores de ejemplo. Los checkbox de RMI abren desmarcados y, según el
texto canónico, se registran expresamente como hallazgos ecográficos ausentes.
Se preservaron orden, etiquetas, opciones, mínimos, máximos, pasos, ayudas y
obligatoriedad.

Las fuentes y archivos de créditos/`NOTICE` sirven como trazabilidad y no
implican certificación, aval ni licencia especial de las organizaciones
nombradas. No existe un `LICENSE` raíz que permita atribuir una licencia
particular a estas reglas.

## Sedlis

Sedlis sólo se evalúa en el contexto posoperatorio apropiado: ganglios
pelvianos negativos, márgenes negativos y ausencia de invasión parametrial.
Una micrometástasis o macrometástasis ganglionar, un margen positivo o invasión
parametrial deja la regla fuera de aplicación.

Una vez confirmado ese contexto, la regla vuelve obligatorios LVSI,
profundidad estromal y tamaño. El motor conserva esta obligatoriedad dinámica:
los campos pueden permanecer vacíos cuando ya existe una exclusión de alto
riesgo, pero el resultado aplicable se declara no calculable si falta alguno.
Un valor ausente nunca se fuerza a negativo.

Las cuatro combinaciones exactas son:

- LVSI positivo y tercio profundo con cualquier tamaño mayor de 0;
- LVSI positivo, tercio medio y tumor al menos 2 cm;
- LVSI positivo, tercio superficial y tumor al menos 5 cm;
- LVSI negativo, tercio medio o profundo y tumor al menos 4 cm.

Se probaron 1,99/2, 4,99/5 y 3,99/4 cm, además del mínimo 0,01 cm para LVSI
positivo y tercio profundo. La regla no cuenta simplemente dos de tres
factores. El tamaño del modelo original fue determinado por palpación clínica;
si se informa anatomía patológica o imágenes, se conserva la advertencia del
origen.

### Defecto canónico preservado

Las células tumorales aisladas producen un retorno temprano. Si al mismo
tiempo existen margen positivo o invasión parametrial, el detalle muestra
solamente la incertidumbre por células aisladas y enmascara los otros hallazgos
de alto riesgo. Es una conducta peligrosa pero canónica: queda demostrada por
una prueba y documentada, no corregida silenciosamente. La historia clínica y
la evaluación profesional deben prevalecer.

Sedlis es una clasificación histórica de riesgo y no constituye por sí sola
una indicación terapéutica.

## Peters

Peters identifica como positivos:

- micrometástasis o macrometástasis ganglionar pelviana;
- margen quirúrgico positivo;
- invasión parametrial.

Los tres datos son obligatorios y explícitos. Si no existe ninguna
característica positiva pero hay solamente células tumorales aisladas, el
resultado queda indeterminado y no trata ese ganglio como completamente
negativo. Si coexisten células aisladas y otro factor positivo, Peters sí queda
positivo y agrega una nota de incertidumbre nodal.

Se preservaron la enumeración y unión natural de uno, dos o tres factores. El
resultado describe riesgo patológico y no prescribe automáticamente un
esquema adyuvante.

## ProMisE / ESGO 2025

POLE, MMR y p53 son obligatorios y se interpretan mediante la jerarquía:

`POLEmut → MMRd → p53abn → NSMP`

Un clasificador múltiple conserva todos los rasgos detectados, pero asigna la
clase por esa prioridad. Las pruebas incluyen el triple positivo y la
combinación MMRd+p53abn. Una variante POLE de significado incierto no se trata
como POLEmut y genera la advertencia correspondiente. El patrón p53 debe
provenir de una interpretación validada y no inferirse de un porcentaje
aislado.

Cuando la clase es NSMP, grado y receptor de estrógeno refinan el grupo:

- bajo grado y ER al menos 10 %: `NSMP bajo grado y ER positivo`;
- alto grado o ER menor de 10 %: `NSMP alto grado o ER negativo`.

La frontera 9,9/10 % está probada. Si grado o ER faltan, la clase NSMP sigue
siendo calculable y el refinamiento aparece `Pendiente`, con una lista explícita
de los datos faltantes. Esos campos no corresponden para POLEmut, MMRd o
p53abn.

La clase molecular no reemplaza el estadio FIGO ni define por sí sola un
tratamiento.

## RMI I

Se conserva la fórmula:

`RMI I = U × M × CA 125`

El multiplicador ecográfico `U` vale 0 sin hallazgos, 1 con uno y 3 con dos o
más de los cinco hallazgos: multilocularidad, áreas sólidas, metástasis,
ascitis y bilateralidad. El multiplicador menopáusico `M` vale 1 en
premenopausia y 3 en posmenopausia.

Las casillas ecográficas desmarcadas significan ausencia, no dato desconocido.
El formulario y la documentación visible deben mantener esta diferencia frente
a otros checkbox del sistema.

El score muestra por separado el umbral histórico 200 y el umbral NICE 250;
ambos son inclusivos. Se probaron CA 125 de 199, 199,9, 200, 249,9 y 250 con
`U=1`, además de `U=0`, `U=3`, pre/posmenopausia y CA 125 igual a 0, que es un
valor válido. La presentación conserva coma decimal en la localización
es-AR.

RMI I es una herramienta de triaje preoperatorio: no confirma ni excluye
malignidad. Otros sistemas pueden aplicar un punto de corte diferente.

## Seguridad

Las cuatro definiciones producen exclusivamente texto y métricas tipadas. No
incorporan HTML crudo, enlaces, `eval`, `Function`, acceso al DOM, `innerHTML`
ni `outerHTML`.

## Evidencia

- 178/178 pruebas doradas del inventario, motor y cuarenta y tres calculadoras;
- formularios vacíos, campos opcionales y restricciones de rango/paso;
- aplicabilidad, requisitos dinámicos, cuatro combinaciones y defecto ITC de
  Sedlis;
- tres factores y dos recorridos de células tumorales aisladas en Peters;
- jerarquía, clasificadores múltiples, VUS y refinamiento NSMP de ProMisE;
- multiplicadores, menopausia, CA 125 y ambos umbrales RMI I;
- textos y notas estructurados sin marcado crudo;
- compilación Angular de producción;
- auditoría estática, de codificación y `git diff --check`.

## Estado pendiente

Calculadoras permanece `Pendiente` en la matriz general. Faltan 14
definiciones, el renderizador Angular visible, configuración institucional y
comparación visual/E2E antes de retirar la biblioteca anterior.
