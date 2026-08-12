# Corte Angular 041: configuración de repositorios oncológicos

Fecha: 2026-08-11
Estado: configuración y preferencia personal implementadas localmente; ingesta y evaluación clínica no implementadas

## Objetivo y alcance real

Este corte incorpora la **configuración versionada del catálogo de repositorios
oncológicos** y de la política institucional que se utilizará en etapas
posteriores. Permite declarar fuentes, atribución, mecanismo de acceso,
preferencias de actualización y modalidad deseada de evaluación.

La configuración guardada **no significa que una fuente ya esté sincronizada**.
En este corte no se ejecutan descargas, búsquedas en historias clínicas, matching
de pacientes, tareas cada 24 horas, alertas en tiempo real ni preguntas clínicas
emergentes. La ingesta, la normalización, el matching y los prompts pertenecen a
cortes posteriores de este documento.

Una fuente puede estar activa en Configuración y, aun así, carecer de un conector
de ejecución, estar desactualizada o requerir revisión humana. Del mismo modo,
seleccionar una modalidad manual, programada o en tiempo real sólo guarda una
política: no crea un trabajo ni un disparador clínico en este corte.

## Preferencia personal «Investigación activa»

Este corte también incorpora un control **por usuario**, visible en la cabecera
principal antes de la identidad de sesión para quien tenga
`section.research.view`. No es una llave global y no modifica la configuración
institucional.

- `V013__user_research_preferences.sql` crea `local_user_preferences` con
  `research_active` inicialmente `false` y una revisión optimista.
- `GET /api/clinical/trial-screening/me` consulta sólo la preferencia del usuario
  autenticado; `PUT` acepta exclusivamente `researchActive` y
  `expectedRevision`. El cliente nunca elige ni envía `userId`.
- La configuración institucional `{enabled, mode}` es un límite superior: la
  preferencia personal no puede habilitar una modalidad que la institución haya
  desactivado.
- Desactivar el control limita únicamente la evaluación **proactiva futura**. La
  consulta manual futura seguirá disponible.
- La respuesta separa `proactiveActive` de `effective` e informa
  `engineReady: false`. Por eso la interfaz muestra **Activa (preparada)**: la
  preferencia persiste, pero no afirma que exista matching.
- Ante un error de guardado la interfaz revierte el cambio optimista y muestra el
  motivo. Un conflicto de revisión no sobrescribe la preferencia guardada desde
  otra sesión.

Todavía no existen conectores, planificador, escucha de diagnósticos, matching ni
modal de preguntas. El toggle prepara una decisión personal para esos cortes
posteriores; por sí solo no ejecuta acciones clínicas.

## Mapa de coincidencias preparado

La pestaña **Investigación** incorpora dos vistas: el registro clínico existente
y un **Mapa de coincidencias** separado. La nueva vista no llama a un endpoint ni
interpreta una lista vacía como ausencia de oportunidades. Mientras
`engineReady=false`, muestra `No ejecutado` y explica que todavía no se evaluó la
historia.

El mapa deja preparado el contrato visual para cuatro estados prudentes:

- `No ejecutado`;
- `No evaluable / faltan datos`;
- `Incompatible por regla dura`, siempre con la evidencia que lo produjo;
- `Requiere auditoría humana`.

Dentro de la auditoría humana podrá ordenar resultados como **Posible para
auditar** o **Alta concordancia para auditar**. Son rangos ordinales, no
probabilidades ni confirmaciones de elegibilidad. La vista prohíbe los términos
“candidato seguro” y “elegible” para una conclusión automática.

El profesional puede explorar tres perfiles locales: orientado a sensibilidad,
equilibrado y orientado a especificidad. Sólo modificarán amplitud, orden y
prioridad de preguntas; nunca una exclusión dura ni la decisión clínica final.
En este corte el perfil no se persiste ni ejecuta matching. Los futuros umbrales
deberán versionarse, validarse clínicamente y quedar asociados a cada ejecución.

Cada resultado futuro deberá mostrar fuente oficial y versión, criterio original
y normalizado, dato clínico considerado, estado conocido o faltante, explicación
reproducible y enlace al registro original.

## Dos clases de contenido que no deben confundirse

### Ensayos clínicos externos

ClinicalTrials.gov, NCI, WHO ICTRP, CTIS, ANMAT, RENIS y ReBEC publican registros
de investigación con distintos grados de detalle y actualidad. Permiten detectar
una **posible oportunidad de preselección** y abrir el registro oficial para
confirmar estado, centro y contacto.

Una coincidencia con esos registros no es una indicación terapéutica ni confirma
elegibilidad. Gran parte de los criterios oncológicos decisivos permanece en
texto libre; el estado de reclutamiento puede cambiar y la decisión final
corresponde al equipo investigador del centro del ensayo.

### Protocolos terapéuticos COIR

Los protocolos COIR son contenido terapéutico institucional: describen esquemas,
drogas, preparación y operación clínica local. Responden a una pregunta distinta:
qué protocolo institucional vigente merece revisión para un cuadro clínico.

Para el matching futuro sólo podrán participar protocolos terapéuticos activos
cuya composición y vínculo clínico estén confirmados. Los registros **COIR sin
vincular**, los servicios y los procedimientos de agenda no deben transformarse
automáticamente en recomendaciones clínicas. Primero requieren validación y
clasificación institucional.

Tampoco una coincidencia COIR debe prescribir por sí sola. Es apoyo para revisión
del profesional, condicionado por la versión vigente, indicación aprobada,
situación del paciente y gobernanza clínica de COIR.

| Aspecto | Ensayo externo | Protocolo terapéutico COIR |
|---|---|---|
| Finalidad | Detectar una posible oportunidad de investigación | Revisar una alternativa terapéutica institucional |
| Autoridad sobre elegibilidad o indicación | Centro investigador y protocolo completo | Profesional tratante y gobernanza clínica COIR |
| Estado esperado | Reclutamiento, centros y fechas cambian | Versión, vigencia y aprobación institucional |
| Resultado seguro en HCOP JP | “Posible para revisar” | “Podría aplicar; revisar protocolo vigente” |
| Nunca debe decir | “Paciente elegible” | “Tratamiento indicado” |

## Fuentes oficiales y capacidad real

La integración futura debe utilizar conectores documentados, archivos oficiales
o curación humana. No debe depender de scraping frágil ni atribuir una API a una
fuente que no la publica.

El catálogo inicial configura ClinicalTrials.gov, NCI, WHO ICTRP, EU CTIS,
ANMAT y RENIS. ReBEC y la Dirección Nacional del Cáncer se documentan como
referencias oficiales evaluadas, pero no forman parte de las fuentes iniciales
configuradas.

| Fuente oficial | Estado en la configuración inicial | Capacidad aprovechable | Frecuencia orientativa y límites |
|---|---|---|---|
| [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api) | Configurada y activa, sin clave. | API pública JSON/CSV. Endpoints base: `https://clinicaltrials.gov/api/v2/studies` y `/studies/{nctId}`; admite hasta 1.000 registros por página. | Sincronización diaria; la fuente informa actualizaciones de lunes a viernes y expone `dataTimestamp`. Mantener atribución, fecha de procesamiento y enlace al original. No garantiza exactitud, reclutamiento efectivo ni elegibilidad. Ver [términos](https://clinicaltrials.gov/about-site/terms-conditions) y [descargo](https://clinicaltrials.gov/about-site/disclaimer). |
| [NCI Clinical Trials Search API v2](https://clinicaltrialsapi.cancer.gov/developer-guide) | Configurada pero inactiva hasta disponer de clave mediante un conector seguro. La clave no pertenece a la configuración versionada. | API oncológica en `https://clinicaltrialsapi.cancer.gov/api/v2` con recursos de ensayos, organizaciones, enfermedades e intervenciones; requiere `x-api-key`. | Sincronización diaria dentro de la cuota asignada. La cobertura se centra en estudios apoyados por NCI y centros designados por NCI, no en todo el mundo. La API pública omite datos regulatorios, de acumulación y de pacientes; no debe suponerse que ofrece todos los biomarcadores de elegibilidad. Ver [API y acceso](https://www.cancer.gov/syndication/api) y [reutilización](https://www.cancer.gov/policies/copyright-reuse). |
| [WHO ICTRP](https://www.who.int/tools/clinical-trials-registry-platform) | Configurada para consulta o descarga, sin automatización habilitada. | Portal global agregado y descarga pública CSV/XML. | La base pública se actualiza semanalmente. Los [términos de descarga](https://www.who.int/tools/clinical-trials-registry-platform/network/who-data-set/downloading-records-from-the-ictrp-database) exigen atribución y actualidad y restringen usos promocionales o comerciales. El [XML Web Service](https://www.who.int/publications/m/item/who-ictrp-web-service---conditions-of-use) es un servicio separado, con acuerdo, credenciales y restricciones —incluido almacenamiento local—; no es una API pública abierta. |
| [EU Clinical Trials Information System (CTIS)](https://www.ema.europa.eu/en/human-regulatory-overview/research-development/clinical-trials-human-medicines/clinical-trials-information-system) | Configurada como portal/exportación; el corte actual no ejecuta RSS ni CSV. | Portal público, exportación CSV, documentos HTML/PDF y RSS de búsquedas guardadas. | Reconciliación diaria sólo después de validar el procedimiento; en su defecto, revisión manual. No hay una API pública de desarrollador documentada. Los estudios anteriores pueden permanecer en EudraCT. Respetar la [guía de búsqueda](https://euclinicaltrials.eu/search-tips-and-guidance/?lang=en) y el [aviso legal de EMA](https://www.ema.europa.eu/en/about-us/about-website/legal-notice). |
| [ANMAT — Estudios de Farmacología Clínica](https://www.argentina.gob.ar/anmat/regulados/base-de-datos-estudios-de-farmacologia-clinica) | Configurada como archivo oficial; no se descarga en este corte. | Planilla de estudios aprobados en Argentina, útil para confirmar autorización local. | Puede comprobarse diariamente si se publicó una nueva versión, sin asumir que la fuente cambia cada día. No hay API pública documentada. “Aprobado” no equivale a “reclutando” ni a “aplica al paciente”; se debe verificar registro, centro y contacto. El portal general declara [CC BY 4.0 salvo indicación distinta](https://www.argentina.gob.ar/terminos-y-condiciones). |
| [RENIS](https://www.argentina.gob.ar/salud/epidemiologia/registro-nacional-de-investigaciones-en-salud-renis) | Configurada para consulta manual. | Consulta pública de investigaciones registradas en Argentina. | No hay API pública documentada. El [dataset de datos.gob.ar](https://datos.gob.ar/dataset/salud-registro-nacional-investigaciones-salud-renis) visible al relevar esta función tenía publicaciones antiguas y no debe utilizarse como única fuente de reclutamiento actual. |
| [ReBEC](https://ensaiosclinicos.gov.br/search) | Referencia regional, no incluida en el catálogo inicial. | Registro brasileño oficial operado por Fiocruz, útil para centros regionales o fronterizos. | No hay API pública documentada ni licencia explícita de reutilización masiva identificada. Como ReBEC alimenta WHO ICTRP, debe deduplicarse por identificadores y puede consumirse primero a través de ICTRP. Ver [descripción oficial](https://ensaiosclinicos.gov.br/page/about). |
| [Dirección Nacional del Cáncer de Argentina](https://www.argentina.gob.ar/salud/inc/institucional) | Referencia terapéutica para curación futura, no repositorio de ensayos configurado. | Guías, recomendaciones, algoritmos y documentos oficiales. | Contenido web/PDF sin API clínica estructurada. Se debe conservar referencia, versión, vigencia y fecha de revisión; nunca inferir reglas desde un PDF sin validación clínica. La función institucional está descrita también en [Argentina.gob.ar](https://www.argentina.gob.ar/node/344729). |

La frecuencia indicada es una política propuesta para HCOP JP, no una promesa de
actualización de cada organismo. Cada conector futuro deberá registrar
`source_updated_at`, `fetched_at`, resultado de la ejecución y última verificación
correcta. Si una fuente supera su umbral de antigüedad, deberá mostrarse como
desactualizada y no generar avisos proactivos.

## Descarga y costo operativo orientativo

La primera ingesta debe limitarse a oncología. NCI ya es una fuente oncológica;
en las fuentes generales se filtrarán condiciones neoplásicas y luego se
normalizarán localmente con vocabularios clínicos. Descargar un registro no
significa obtener el protocolo completo: muchas fuentes publican sólo la ficha,
criterios resumidos, centros y estado. La decisión final siempre requiere el
protocolo vigente y la confirmación del centro investigador.

| Fuente o recurso | ¿Se puede bajar? | Costo de acceso identificado |
|---|---|---|
| ClinicalTrials.gov | Sí: API v2 JSON/CSV y descarga ZIP del catálogo público. | Sin clave ni arancel publicado; aplicar términos, atribución y cadencia. |
| NCI CTS API | Sí: JSON mediante API con clave. | No publica un arancel de uso; cuenta estándar: 1 solicitud/s y 50.000/mes. |
| WHO ICTRP | Sí: CSV/XML del portal, incluso el conjunto público según sus condiciones. | Descarga pública sin cargo; el Web Service XML en tiempo real tiene costo a consultar y condiciones distintas. |
| EU CTIS | Sí: resultados y documentos desde el portal; búsquedas pueden exponer descarga y RSS. | Sin arancel documentado para el portal público; no existe una API pública de desarrollador documentada. |
| ANMAT | Sí: planilla XLSX oficial. | Descarga pública sin arancel identificado. |
| RENIS | Consulta pública; no se identificó una API masiva oficial estable. | Sin arancel para consulta pública; automatización pendiente de un mecanismo oficial. |

La IA no debe utilizarse para volver a buscar cada paciente en Internet. Primero
se descarga el catálogo público y, sólo ante criterios libres que el parser
determinístico no resuelva, un LLM puede proponer una estructura para revisión.
Con la tarifa publicada de Gemini 3.5 Flash al 11/08/2026, el cálculo de referencia
es `tokens_entrada × USD 1,50/M + tokens_salida_y_razonamiento × USD 9/M`.
Por ejemplo, 4.000 tokens de entrada y 1.000 de salida cuestan aproximadamente
USD 0,015 por registro; no es una cotización y el consumo real depende de la
longitud y del razonamiento. Procesar 10.000 registros con ese máximo sería unos
USD 150, pero el diseño previsto reduce ese costo aplicando reglas primero,
reprocesando sólo versiones nuevas y enviando al LLM únicamente los casos no
resueltos. Un LLM local elimina el costo por token externo a cambio de hardware,
energía y mantenimiento.

## Datos útiles para normalización y matching futuro

El registro normalizado deberá conservar el original y su procedencia, no
reemplazarlo. Como mínimo:

- identificador primario y secundarios, tipo de fuente (`external_trial` o
  `coir_protocol`), URL oficial y versión;
- estado, fecha de última verificación, países, centros y contactos públicos;
- tumor o sitio, histología, estadio y TNM, enfermedad medible y metástasis;
- biomarcadores con gen, variante, método, muestra, umbral, polaridad y fecha;
- línea terapéutica, tratamientos previos, intervalos de lavado e intervenciones;
- edad, sexo cuando sea criterio, embarazo, ECOG, función orgánica y laboratorios
  con unidad;
- inclusiones, exclusiones y fragmentos de evidencia que expliquen el resultado;
- para COIR: vigencia, versión, responsable de aprobación y próxima revisión.

No todos estos campos están estructurados en las fuentes externas. Un valor
ausente se conserva como desconocido; nunca se infiere como favorable.

## Matching local y privacidad

El diseño objetivo separa dos flujos:

1. **Sincronización del catálogo:** consulta fuentes oficiales sin datos de
   pacientes y guarda contenido normalizado, procedencia y fecha.
2. **Evaluación clínica:** compara localmente ese catálogo con los datos
   estructurados de la historia clínica.

Los nombres, documentos, números de historia, notas libres, fechas
identificatorias y otros datos personales no deben enviarse a ClinicalTrials.gov,
NCI, WHO, CTIS, ANMAT, RENIS, ReBEC ni a un proveedor de IA. Las consultas
externas sólo actualizarán el catálogo general. Los logs no deben copiar texto
clínico ni criterios con identificadores.

El diseño objetivo es **híbrido y con límites explícitos**:

- las reglas duras, versionadas y determinísticas evalúan los criterios
  estructurados, producen el triestado y conservan la decisión final explicable;
- Gemini u otro LLM externo podrá utilizarse únicamente para normalizar **texto
  público del ensayo o protocolo**, sin datos de pacientes;
- el texto libre de la historia clínica sólo podrá procesarse con un LLM local en
  loopback y bajo política institucional. Si ese recurso local no está
  disponible, el criterio queda `DESCONOCIDO`;
- ningún LLM puede declarar elegibilidad, prescribir, completar silenciosamente
  un dato clínico ni convertir una inferencia en hecho estructurado.

La existencia de una clave Gemini configurada no autoriza el envío de historias
clínicas. Cualquier ampliación de estos límites requiere una decisión específica
de privacidad, seguridad y gobernanza institucional.

Cada resultado deberá ser reproducible: versión de fuente, versión del
normalizador, reglas evaluadas, datos clínicos considerados, fecha, usuario y
justificación. El matcher no debe modificar la historia ni completar campos por
inferencia.

## Modelo triestado

Cada criterio normalizado se evalúa con tres valores:

- **CUMPLE:** el dato estructurado y vigente de la historia respalda el criterio.
- **NO_CUMPLE:** el dato contradice un requisito obligatorio o confirma una
  exclusión.
- **DESCONOCIDO:** falta el dato, es ambiguo, está vencido, no tiene unidad
  compatible o sólo existe en texto no validado.

La agregación conserva la prudencia:

- un solo `NO_CUMPLE` duro descarta el candidato en esa evaluación;
- si no hay descarte duro pero queda un dato decisivo en `DESCONOCIDO`, el
  resultado global es `DESCONOCIDO`;
- `CUMPLE` significa únicamente que **la preselección computable no encontró una
  barrera**, nunca elegibilidad para un ensayo ni indicación automática.

Las reglas duras son la autoridad de esta agregación. Una extracción asistida
por LLM sólo propone evidencia para revisión o conserva `DESCONOCIDO`; nunca
resuelve por sí sola la elegibilidad.

La pantalla futura deberá mostrar por qué se obtuvo el resultado, qué datos
faltan, qué regla descartó, la fuente y su versión y un enlace al registro
oficial. No debe ocultar criterios que el motor no pudo interpretar.

## Modos de ejecución previstos

Estos modos describen el comportamiento objetivo. En el corte actual sólo se
guardan la política institucional y la preferencia personal; **ningún modo de
evaluación está operativo**.

| Modo | Disparador futuro | Comportamiento seguro |
|---|---|---|
| Manual | El profesional solicita revisar oportunidades para el paciente abierto. | Ejecuta matching local sobre el catálogo ya sincronizado y muestra candidatos explicados. No bloquea la atención. |
| Programado | Tarea institucional, por ejemplo cada 24 horas. | Primero actualiza las fuentes según su propia cadencia; después reevalúa sólo historias con cambios o fuentes nuevas. Agrupa novedades y evita repetir resultados sin cambios. |
| Tiempo real | Guardado confirmado de un diagnóstico, anatomía patológica, estadio, biomarcador o tratamiento relevante. | Evalúa localmente después del guardado —nunca en cada tecla— y sólo interrumpe si uno o pocos datos podrían cambiar una oportunidad concreta. |

La actualización cada 24 horas no obliga a descargar una fuente que sólo publica
semanalmente. El planificador futuro respetará la cadencia, cuotas, términos y
mecanismos oficiales de cada repositorio.

## UX anti-fatiga para el modo tiempo real

El objetivo no es pedir una ficha completa, sino sugerir el próximo dato que más
reduzca la incertidumbre.

- Reutilizar primero todo dato estructurado ya presente en la historia.
- Preguntar sólo si hay un candidato vigente y la respuesta puede cambiar su
  triestado.
- Mostrar entre una y tres preguntas de alto valor informativo por intervención.
- Agrupar candidatos que necesiten el mismo dato; no abrir un modal por protocolo.
- Esperar el guardado clínico y aplicar un período de enfriamiento.
- Permitir **Completar ahora**, **No disponible**, **Recordar más tarde** y
  **No volver a preguntar en este episodio**.
- Después del primer aviso, usar un indicador pasivo con oportunidades y datos
  pendientes.
- No repetir una pregunta hasta que cambien el diagnóstico, protocolo, fuente o
  respuesta previa.
- No impedir guardar, prescribir ni cerrar la consulta.

Los límites de frecuencia, silencios y respuestas deben ser auditables por
usuario y episodio. La ausencia de respuesta sigue siendo `DESCONOCIDO`, no un
dato negativo.

## Riesgos clínicos y controles mínimos

- **Falsa certeza:** usar “posible coincidencia para revisión”; prohibir
  “elegible” e “indicado”.
- **Fuente desactualizada:** mostrar última verificación, detener avisos
  proactivos vencidos y enlazar al original.
- **Criterios en texto libre:** marcar lo no interpretado como desconocido y
  ofrecer el fragmento original.
- **Falsos positivos y negativos:** validar retrospectivamente con oncología e
  investigación antes de activar avisos.
- **Unidades, estadificación y biomarcadores incompatibles:** normalizar con
  versión y exigir equivalencia explícita; no convertir silenciosamente.
- **Cobertura desigual:** explicar qué fuentes están habilitadas y qué regiones
  o centros no cubren.
- **Cambio de protocolo COIR:** fijar la versión usada y reevaluar al publicarse
  una nueva.
- **Automatización excesiva:** mantener confirmación humana, auditoría,
  posibilidad de silenciar y un canal para reportar resultados incorrectos.

## Roadmap en tres cortes

### Corte 1 — Configuración y preferencia personal (actual)

- Catálogo versionado de fuentes oficiales y su intención de uso.
- Política configurable para modos manual, programado y tiempo real, frecuencia
  y límites anti-fatiga.
- Separación entre ensayos externos y protocolos terapéuticos COIR.
- Validaciones que mantienen la evaluación local y prohíben declarar envío de
  información clínica a repositorios externos.
- Preferencia `Investigación activa` self-only, persistente, con revisión
  optimista y subordinada a `{enabled, mode}` institucional.
- Contrato honesto con `engineReady: false`, `effective: false` y estado visual
  **Activa (preparada)** mientras no exista el motor.

**No incluido:** conectores, descargas, estado de sincronización real,
normalización, matching, trabajos programados, escucha en tiempo real, alertas o
prompts.

### Corte 2 — Ingesta y catálogo normalizado (posterior)

- Conectores por fuente, respetando APIs, cuotas, términos y formatos oficiales.
- Registros originales y normalizados con procedencia, versiones y deduplicación.
- Actualización manual y programada, observabilidad, reintentos, antigüedad y
  desactivación segura.
- Curación humana para PDF/CSV y protocolos COIR, todavía sin intervención
  proactiva en la historia clínica.

Antes de cerrar este corte deberán probarse licencias, caídas de fuente, cambios
de esquema, duplicados y recuperación de la última copia válida.

### Corte 3 — Matching clínico y acompañamiento (posterior)

- Matching local explicable con triestado, primero manual y en modo sombra.
- Reglas duras como autoridad; Gemini sólo para texto público de fuentes y texto
  clínico libre únicamente con LLM local/loopback.
- Validación clínica retrospectiva y prospectiva, métricas de falsos positivos y
  negativos y aprobación institucional.
- Ejecución programada y luego tiempo real sobre eventos guardados.
- Prompts de datos faltantes con límites anti-fatiga, auditoría y silencios.

El paso de manual a programado y de programado a tiempo real requiere una
aprobación clínica separada. Configurar una fuente en el corte 1 no habilita
automáticamente ninguna de esas etapas.

## Criterio de salida clínica

La función estará lista para uso asistencial sólo cuando cada resultado pueda
responder, de manera visible y auditable: qué fuente y versión se usó, qué datos
del paciente se evaluaron, qué criterios cumplen, no cumplen o son desconocidos,
qué información falta, cuán reciente es el registro y quién debe confirmar la
decisión. Hasta entonces debe considerarse infraestructura de configuración o un
piloto no asistencial, según el corte alcanzado.
