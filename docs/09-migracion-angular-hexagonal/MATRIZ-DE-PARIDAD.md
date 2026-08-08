# Matriz histórica de paridad funcional

> **Documento de trazabilidad.** Los estados de esta tabla corresponden a los
> cortes incrementales que se registran debajo y no describen por sí solos la
> entrada vigente del producto. La aplicación operativa actual usa un único
> frontend Angular, sin iframe ni ejecución del JavaScript anterior. Las rutas
> y comprobaciones del corte definitivo están en
> [Corte final de entrada Angular](CORTE-FINAL-ENTRADA-ANGULAR.md).

Esta matriz fue el contrato de aceptación durante la migración. Una capacidad sólo
puede marcarse como completada cuando conserva comportamiento, permisos,
persistencia, respuesta ante errores y apariencia clínica.

Estados posibles: `Pendiente`, `En convivencia`, `Validada` y `Retirada` para
la implementación anterior.

| Capacidad | Entrada vigente | Autoridad / API principal | Criterio de paridad | Angular | Backend hexagonal |
|---|---|---|---|---|---|
| Login y sesión | Pantalla de acceso | `/api/auth/**`, usuarios y sesiones | Login, cierre, expiración, cookie segura, recuperación de contexto y errores equivalentes | Pendiente | Pendiente |
| Usuario y permisos | Cabecera y Configuración | `/api/admin/**`, RBAC | Misma visibilidad y prohibición efectiva por rol; el servidor continúa siendo la barrera final | Pendiente | Pendiente |
| Paciente activo | Abrir, nuevo y cerrar paciente | `/api/clinical/patients/**`, `/api/auth/active-patient` | Mantener paciente al navegar/recargar y liberarlo sólo mediante cierre explícito | Pendiente | Pendiente |
| Hoja clínica | Panel izquierdo | `/api/hc`, documento JSON versionado | Orden, formularios, evoluciones, edición, impresión y conflicto `409` sin pérdida | Pendiente | Pendiente |
| Diagnóstico | Modal desde la hoja | Diagnósticos, SNOMED, CIE-10 y AJCC | Selección obligatoria, TNM/estadio, varios diagnósticos y evolución resultante | Pendiente | Pendiente |
| Estudios | Solapa Estudios | `/api/media/**`, `clinical_files` | Carga múltiple, pegado, plantillas, orden, edición, dibujo, descarga y eliminación de sesión | Pendiente | Pendiente |
| Prescripción general | Solapa Prescripción | APIs de prescripción y hoja | Medicamentos, prácticas, estudios y documentos con datos de cobertura completos | Validada | En convivencia |
| Protocolos | Solapa y Configuración | `/api/clinical/protocols/**` y catálogo SEER*Rx | Búsqueda, detalle, drogas, dosis, preparación, tiempos, edición y versionado | En convivencia | En convivencia |
| Nuevo tratamiento | Hospital de Día | `/api/clinical/patients/{id}/treatments` | Diagnóstico existente, protocolo, antropometría, dosis, requisitos, ciclos y evolución atómica | Pendiente | Pendiente |
| Tratamiento | Lista y detalle | APIs de tratamientos | Tarjetas, documentos, estado, consentimiento, drogas y árbol ciclo–día–aplicación | Pendiente | Pendiente |
| Farmacia | Hospital de Día | Cola `pharmacy` y comandos farmacéuticos | Búsqueda, filtros, auditoría, procedencia, recepción, reserva, liberación, rechazo y QR | Pendiente | Pendiente |
| Agenda | Turnos y sala | `/api/clinical/infusions/**` | Fecha, sillones, zoom, arrastrar, mover, quitar, duración, colores y cero superposiciones | Pendiente | Pendiente |
| Sala de hoy | Turnos y sala | Cola `administration` | Orden por hora/sillón, búsqueda, estados, doble control y apertura de la aplicación exacta | Pendiente | Pendiente |
| Triaje | Hospital de Día | `clinical-authorization` | Laboratorio, signos, toxicidad, PASS/FAIL, justificación, postergación y liberación asociada | Pendiente | Pendiente |
| Preparación | Hospital de Día | Comandos `preparation/**` | Inicio, componentes, lotes, TTL, etiqueta, liberación, vencimiento y repetición trazable | Pendiente | Pendiente |
| Administración | QR y Sala | Comandos `administration/**` | Escaneo, identidad, doble chequeo, inicio, dosis real, reacción, interrupción, reanudación y cierre | Pendiente | Pendiente |
| Suspensión y continuidad | Tratamiento y espera | `/api/clinical/treatments/**/workflow/**` | Solicitudes, responsables, motivos, suspensión temporal/definitiva, nueva prescripción y evolución | Pendiente | Pendiente |
| Configuración H. de Día | Configuración | Ajustes de sillones | Sillones, fracción 5/10/15/20/30, jornada y efecto inmediato controlado sobre agenda | Pendiente | En convivencia |
| Guías | Configuración y Herramientas | `/api/guides/**` | Carga, metadatos, activación, búsqueda, apertura y conservación del archivo | En convivencia | En convivencia |
| AJCC/TNM | Herramientas | `/api/ajcc8/**` y catálogos locales | Sitio, ejes T/N/M y factores propios, cálculo determinístico, fuentes, permisos y errores equivalentes | En convivencia | En convivencia |
| Calculadoras | Configuración y Herramientas | Configuración versionada | Migrar y comparar individualmente las 57 calculadoras/scores; crear fórmula sin programar, variables, reglas, rangos, vista previa, activar y ejecutar | En convivencia | En convivencia |
| Investigación | Configuración e Investigación | Formularios versionados y hoja | Constructor, orden, etiquetas, tipos, obligatoriedad, versión aplicada y recuperación de respuestas | Pendiente | En convivencia |
| Plantillas anatómicas | Configuración y Estudios | `/api/study-templates/**` | Catálogo, miniaturas, derechos, alta, baja, selección, marcado e incorporación al estudio | Pendiente | Pendiente |
| Agente y línea temporal | Solapas derechas | `/api/llm/**` y hoja | Configuración local/remota, errores claros, paciente activo, resaltado y ausencia de pérdida de foco | En convivencia | En convivencia |
| Ayuda y documentación | Cabecera y páginas de ayuda | Recursos estáticos | Índice, manuales, diagramas, videos y enlaces accesibles desde la interfaz final | Pendiente | No aplica |
| Instalación y actualización | Lanzador y Docker | GHCR, Compose, Flyway | Primer inicio, actualización conservando datos, respaldo, restauración, healthcheck y un solo comando | Pendiente | Pendiente |

Las 57 calculadoras y scores continúan en transición y la fila queda
explícitamente `En convivencia`; Guías y AJCC/TNM no modifican ese estado.
La base Angular ya porta **57 de 57 definiciones y reglas** con pruebas doradas,
y el corte 023 incorpora un renderizador Angular nativo con permiso efectivo y
carga diferida. El corte 024 agrega, todavía de forma aislada, el catálogo
operativo, el merge de built-ins y el motor seguro de fórmulas/scores; el corte
025 suma la factory que los convierte al contrato visual común. El corte 026
valida atómicamente el JSON institucional y el corte 027 conecta el endpoint
como autoridad, ensambla built-ins, overrides y configurables, y mantiene el
workspace cerrado durante carga, error, invalidación o falta de permiso. El
corte 028 completa el smoke Docker aislado, el recorrido autorizado y la
corrección responsive según el ancho real del panel. La capacidad permanece
`En convivencia`: todavía faltan el recorrido visual con un usuario autenticado
sin permiso y la comparación formal de todas las resoluciones admitidas.

El corte 029 corrige la lectura de tratamientos históricos en la hoja Angular:
separa sistémicos, radioterapia y cirugías a partir de la vista relacional y el
documento persistido, incluidas evoluciones explícitamente categorizadas, sin
duplicarlas ni migrar datos. La fila Hoja clínica continúa `Pendiente` porque
sus recorridos de edición, impresión y conflicto de versión aún no alcanzaron
paridad.

El corte 030 agrega la proyección específica de impresión —identidad ampliada,
timestamp y omisión de secciones vacías— y corrige el contrato de revisión del
workspace entre Java y Angular. La fila Hoja clínica continúa `Pendiente` hasta
que edición, borrador recuperable y resolución explícita de `409` estén
validados.

El corte 031 tipa las cuatro causas de `409` de la hoja y conserva en memoria
copias profundas de la base y del intento. El borrador sólo se proyecta sobre el
mismo paciente; la interfaz bloquea nuevos guardados y salidas que podrían
perderlo hasta descartar y recargar explícitamente. La fila continúa
`Pendiente`: el corte 032 ya agrega una comparación conservadora de sólo lectura
por campo/registro, con una lectura aislada y control de respuestas tardías. Aún
faltan merge humano por registro y editores equivalentes a legacy. El corte 033
ya valida en dos sesiones Chrome y PostgreSQL efímero que la segunda escritura
recibe `VERSION_CONFLICT`, conserva su borrador y nunca pisa la revisión
ganadora.

El corte 034 migra de extremo a extremo **Conclusión / resumen**: formulario
Angular estructurado, primera carga, modificación con motivo, vaciado,
auditoría y versiones firmadas por Java, borrador previo al `PUT`, protección de
formas legacy no textuales, respuesta canónica y dos recorridos Chrome contra
PostgreSQL efímero. La fila continúa `Pendiente` porque los demás editores de la
hoja y el historial visible equivalente aún no alcanzaron paridad.

El corte 035 migra **Motivo de consulta** con el recuadro `+ Cargar` y el lápiz
del diseño original, modal Angular nativo, borrador protegido, primera carga,
modificación con motivo, límite de 50.000 caracteres y auditoría canónica. Java
generaliza la autoridad de secciones narrativas sin cambiar el contrato ya
validado de Conclusión / resumen. La fila Hoja clínica continúa `Pendiente`
hasta migrar los restantes editores e historial visible.

El corte 036 migra **Antecedentes de enfermedad actual** al mismo editor Angular
nativo y al motor puro compartido de narrativas simples. Conserva el `textarea`
amplio del formulario histórico, primera carga, modificación con motivo,
borrador protegido, límite de 50.000 caracteres, compatibilidad legacy y
autoridad Java específica sobre `narrative.currentIllness`. La fila Hoja
clínica permanece `Pendiente`: el E2E integrado del corte está aprobado, pero
todavía faltan los restantes formularios y el historial visible por sección.

El corte 037 implementa **Antecedentes personales** como formulario Angular
nativo de dos columnas. Conserva por separado Clínicos / quirúrgicos,
Medicación habitual, Oncofamiliares y Gineco-obstétricos, y firma una sola
instantánea ordenada por guardado mediante autoridad Java sobre
`personalHistory`. Incluye compatibilidad con formas legacy, borrador protegido
y 14 casos puros con 104 aserciones. Sus 66 pruebas Java/Swagger y cinco
recorridos E2E integrados están aprobados. La fila Hoja clínica continúa
`Pendiente` porque todavía faltan los formularios restantes y el historial
visible por sección.

El corte 038 implementa **Examen físico** con Peso, Talla y texto libre en un
modal Angular nativo, métricas en vivo, plantilla explícita y una sola cadena de
versiones canónicas. La UI trabaja en centímetros y PostgreSQL conserva
`exam.heightM` en metros, con lectura compatible de ambas formas históricas. El
snapshot mantiene las filas clínicas del frontend anterior. La fila Hoja
clínica continúa `Pendiente`, aunque el corte está validado con 14 casos y 83
aserciones del helper, 6 casos y 28 aserciones de impresión, 81/81 pruebas
Java/OpenAPI y 6/6 recorridos Docker/Playwright. Sólo faltan Estudios
complementarios coordinados y el historial visual por sección para cerrar la
paridad global de la hoja.

El corte 039 coordina **Estudios complementarios** entre la hoja y su panel con
una proyección única: la hoja conserva orden ascendente y el panel orden
descendente; seleccionar una entrada abre y enfoca la tarjeta exacta y el alta
reutiliza el modal existente. Los registros sin ID mantienen una clave común
entre ambos contextos y las tarjetas publican `role="button"` y `aria-pressed`.
Angular y Java aplican `section.studies.view` y `section.studies.edit`. La
evidencia aprobada comprende 9/9 casos de proyección, 7 casos y 30 aserciones de
impresión, 19/19 pruebas focales de backend y 7/7 recorridos Docker/Playwright;
el E2E incluye carga y eliminación reales y cierre automático tras el guardado
exitoso. La fila Estudios permanece `Pendiente` por la
consistencia transaccional binario+estado, conciliación de huérfanos, matriz de
formatos, pegado contextual y paridad de visor, plantillas, anotación y orden.
La fila Hoja clínica permanece `Pendiente` por el historial visual equivalente
por sección. El progreso global se estima conservadoramente en alrededor de
96,5 %; no representa una certificación de liberación.

## Evidencia requerida para marcar `Validada`

1. Prueba automática de la regla o del contrato.
2. Prueba E2E del recorrido principal y al menos un error relevante.
3. Comparación visual en las resoluciones admitidas.
4. Comprobación con usuario autorizado y usuario sin permiso.
5. Verificación de persistencia y recuperación tras reiniciar.
6. OpenAPI y documentación actualizados.
7. Resultado satisfactorio en la instalación Docker aislada.
