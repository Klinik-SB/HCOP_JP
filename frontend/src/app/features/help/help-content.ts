export type HelpRole = 'Todos' | 'Oncología' | 'Farmacia' | 'Admisión' | 'Triaje' | 'Enfermería' | 'Administración';

export interface HelpStep { readonly title: string; readonly detail: string; }
export interface HelpSection {
  readonly id: string; readonly eyebrow: string; readonly title: string; readonly summary: string;
  readonly roles: readonly HelpRole[]; readonly steps: readonly HelpStep[];
  readonly notes?: readonly string[]; readonly warning?: string; readonly keywords: readonly string[];
}

export const HELP_ROLES: readonly HelpRole[] = ['Todos', 'Oncología', 'Farmacia', 'Admisión', 'Triaje', 'Enfermería', 'Administración'];

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: 'inicio', eyebrow: 'Primeros pasos', title: 'Una ficha, un paciente y un recorrido',
    summary: 'La hoja izquierda conserva la historia clínica. El panel derecho reúne estudios, tratamiento, prescripción y herramientas para el mismo paciente.', roles: ['Todos'],
    steps: [
      { title: 'Compruebe su sesión', detail: 'El nombre y el rol de la cabecera identifican a quien quedará registrado en cada acción.' },
      { title: 'Abra o cree un paciente', detail: 'Abrir paciente recupera una ficha existente. Nuevo paciente inicia una historia completamente vacía.' },
      { title: 'Verifique la identidad', detail: 'Antes de cargar datos, confirme nombre, DNI, cobertura y diagnóstico en la cabecera.' },
      { title: 'Trabaje en la sección correspondiente', detail: 'Use la hoja para documentar y las pestañas de la derecha para tareas asistenciales.' },
      { title: 'Cierre la tarea', detail: 'Confirme cada formulario y revise el resultado en la historia o en la etapa operativa siguiente.' }
    ],
    notes: ['El divisor central se arrastra. Sus tres controles muestran sólo la derecha, mitad y mitad, o sólo la historia.', 'Una función ausente o deshabilitada indica que el rol activo no tiene ese permiso.'],
    keywords: ['inicio', 'paciente', 'cabecera', 'divisor', 'pestañas', 'sesión', 'permisos']
  },
  {
    id: 'historia', eyebrow: 'Historia clínica', title: 'Documentar la atención oncológica',
    summary: 'La hoja blanca es el documento longitudinal: diagnósticos, antecedentes, examen, tratamientos, estudios, conclusión y evoluciones.', roles: ['Oncología', 'Enfermería'],
    steps: [
      { title: 'Complete los bloques clínicos', detail: 'Use Cargar o Editar en motivo de consulta, enfermedad actual, antecedentes, estudios complementarios, examen físico y resumen.' },
      { title: 'Agregue diagnósticos', detail: 'Registre AJCC/TNM y estadio, SNOMED CT y CIE-10. Un diagnóstico nuevo se agrega al historial; no reemplaza silenciosamente uno anterior.' },
      { title: 'Registre una evolución', detail: 'Agregue fecha, profesional, motivo y texto. Lo guardado queda como texto clínico y con auditoría.' },
      { title: 'Documente tratamientos previos', detail: 'Tratamientos sistémicos, radioterapia y cirugías oncológicas tienen formularios propios y conservan su cronología.' },
      { title: 'Busque o resalte', detail: 'La lupa localiza texto visible. El resaltador marca una selección sin modificar el contenido clínico.' }
    ], warning: 'Revise siempre el paciente activo antes de guardar. Una corrección posterior debe quedar versionada y con su motivo.',
    keywords: ['historia', 'evolución', 'diagnóstico', 'AJCC', 'SNOMED', 'CIE10', 'examen', 'cirugía', 'radioterapia']
  },
  {
    id: 'estudios', eyebrow: 'Historia clínica', title: 'Estudios, archivos e imágenes',
    summary: 'La pestaña Estudios reúne documentos históricos y cargas locales vinculadas al paciente.', roles: ['Oncología', 'Enfermería'],
    steps: [
      { title: 'Seleccione o arrastre archivos', detail: 'Puede cargar varias imágenes, PDF, Word, PowerPoint o videos en una misma operación.' },
      { title: 'Pegue una imagen', detail: 'Con Estudios abierto y el puntero sobre la sección, Ctrl+V toma una imagen disponible en el portapapeles.' },
      { title: 'Use una plantilla', detail: 'Cargar plantilla abre la biblioteca anatómica. La copia elegida puede marcarse y agregarse a una evolución.' },
      { title: 'Anote sin perder el original', detail: 'El editor permite texto, lápiz, resaltador, figuras, flechas y goma. Al guardar genera una imagen derivada.' },
      { title: 'Ordene o elimine la carga reciente', detail: 'Las flechas cambian el orden. Una carga local puede eliminarse dentro de la ventana temporal autorizada de la misma sesión.' }
    ], warning: 'Compruebe que el archivo, la fecha y el paciente sean correctos antes de incorporarlo a una evolución.',
    keywords: ['estudio', 'imagen', 'PDF', 'archivo', 'plantilla', 'anotación', 'pegar', 'subir']
  },
  {
    id: 'circuito', eyebrow: 'Hospital de día', title: 'Circuito asistencial en siete pasos',
    summary: 'Cada aplicación real recorre su propio circuito: paciente + tratamiento + ciclo + día de aplicación.', roles: ['Todos'],
    steps: [
      { title: '1. Prescripción', detail: 'Oncología indica diagnóstico, protocolo, dosis, unidades, vía, ciclos, días y fecha inicial.' },
      { title: '2. Farmacia', detail: 'Farmacia audita la orden, define procedencia y documenta disponibilidad o reserva de stock.' },
      { title: '3. Turno', detail: 'Admisión asigna fecha, sillón y horario según la duración de esa aplicación.' },
      { title: '4. Triaje', detail: 'El día del turno se revisan laboratorio, signos vitales, toxicidad y estado clínico: PASS o FAIL.' },
      { title: '5. Preparación', detail: 'Con PASS, Farmacia registra componentes, lotes, dilución, volumen, vencimiento y vida útil.' },
      { title: '6. Administración', detail: 'Enfermería confirma identidad y etiqueta, realiza el doble control e inicia la administración.' },
      { title: '7. Cierre', detail: 'Se documentan dosis real, horario, observación, incidentes y resultado. La siguiente aplicación vuelve a iniciar el circuito.' }
    ], notes: ['Un esquema con medicación los días 1, 8, 15 y 21 genera cuatro aplicaciones independientes.', 'El tratamiento es el plan longitudinal; la aplicación es la unidad operativa que recibe turno, triaje y administración.'],
    keywords: ['flujo', 'siete pasos', 'tratamiento', 'ciclo', 'aplicación', 'hospital de día']
  },
  {
    id: 'farmacia', eyebrow: 'Paso 2', title: 'Farmacia: validar y asegurar medicación',
    summary: 'La cola permite encontrar cada paciente y día por nombre, DNI, historia, diagnóstico o esquema.', roles: ['Farmacia'],
    steps: [
      { title: 'Localice la aplicación', detail: 'Busque y filtre por prescripción, validación, procedencia y disponibilidad. Priorice la fecha planificada más próxima.' },
      { title: 'Audite la orden', detail: 'Compruebe drogas, dosis, unidad explícita, vía, intervalo, día y premedicación.' },
      { title: 'Defina la procedencia', detail: 'Indique stock del centro, debe traerla el paciente, la tiene el paciente, recibida en el centro o pendiente de proveedor.' },
      { title: 'Apruebe o rechace', detail: 'La validación farmacéutica debe tener un resultado explícito y trazable.' },
      { title: 'Reserve cuando corresponda', detail: 'Para stock del centro, la reserva debe reproducir exactamente todos los componentes prescriptos y sus unidades.' }
    ], notes: ['Stock del centro sólo está asegurado con validación aprobada y reserva activa.', 'Debe traerla el paciente no habilita PASS hasta confirmar que la tiene o que fue recibida.', 'La reserva no equivale a una mezcla preparada; lotes y trazabilidad final se registran en Preparación.'],
    warning: 'No confirme una existencia que no haya sido constatada. El sistema no debe inventar stock, cantidades ni lotes.',
    keywords: ['farmacia', 'stock', 'reserva', 'medicación', 'procedencia', 'validar', 'lote']
  },
  {
    id: 'sillones', eyebrow: 'Paso 3', title: 'Agenda y sillones',
    summary: 'Cada aplicación ocupa en la grilla el tiempo definido por el protocolo y no puede superponerse con otro turno.', roles: ['Admisión'],
    steps: [
      { title: 'Elija la fecha', detail: 'Revise el día de la semana y la cola de aplicaciones pendientes para esa jornada.' },
      { title: 'Filtre y busque', detail: 'Use estado de prescripción o medicación y localice por paciente, DNI, diagnóstico o esquema.' },
      { title: 'Seleccione una aplicación', detail: 'La grilla marca los espacios continuos donde entra su duración completa.' },
      { title: 'Arrastre al sillón', detail: 'Suelte sobre el inicio deseado y confirme fecha, hora, duración y sillón.' },
      { title: 'Mueva o quite con motivo', detail: 'Mover conserva la aplicación. Quitar libera el espacio y la devuelve a pendientes sin borrar el tratamiento.' }
    ], warning: 'La agenda rechaza superposiciones. Si otro usuario ocupa el lugar primero, recargue y elija un nuevo espacio.',
    keywords: ['sillón', 'agenda', 'turno', 'arrastrar', 'duración', 'mover', 'quitar', 'superposición']
  },
  {
    id: 'triaje', eyebrow: 'Paso 4', title: 'Triaje: decidir PASS o FAIL',
    summary: 'La lista del día se ordena por hora y sillón para revisar a cada paciente antes de preparar la medicación.', roles: ['Triaje', 'Oncología', 'Enfermería'],
    steps: [
      { title: 'Abra el turno correcto', detail: 'Confirme paciente, aplicación, ciclo, día, horario y esquema.' },
      { title: 'Registre la evaluación', detail: 'Complete laboratorio relevante, signos vitales, peso actual, toxicidad, síntomas y estado funcional.' },
      { title: 'Emita PASS', detail: 'Sólo si hay turno activo, validación farmacéutica aprobada y medicación asegurada.' },
      { title: 'Emita FAIL', detail: 'Registre el motivo clínico y, si corresponde, una nueva fecha. La aplicación permanece pendiente y reprogramable.' },
      { title: 'Revise el resultado', detail: 'PASS habilita Preparación. FAIL libera el turno operativo y la reserva blanda aplicable, conservando auditoría.' }
    ], warning: 'No use FAIL para borrar una aplicación ni marque como completado un tratamiento que no se administró.',
    keywords: ['triaje', 'PASS', 'FAIL', 'laboratorio', 'toxicidad', 'signos vitales', 'postergar']
  },
  {
    id: 'administracion', eyebrow: 'Pasos 5 a 7', title: 'Preparación, sala y cierre',
    summary: 'La preparación trazable y el doble control preceden siempre al inicio de la administración.', roles: ['Farmacia', 'Enfermería'],
    steps: [
      { title: 'Prepare sólo con PASS', detail: 'Registre una traza por cada componente: lote, vencimiento, dilución, concentración, volumen y vida útil.' },
      { title: 'Libere a sala', detail: 'Compruebe que la mezcla esté completa, etiquetada y vigente antes de cambiar su estado.' },
      { title: 'Identifique la aplicación', detail: 'Abra Sala de hoy o escanee el QR. Ambos caminos llevan a la misma ficha canónica.' },
      { title: 'Realice el doble control', detail: 'Confirme paciente y etiqueta, y registre un segundo profesional habilitado distinto de quien inicia.' },
      { title: 'Administre y cierre', detail: 'Documente inicio, dosis real, interrupciones o reacciones y finalización con la condición del paciente.' }
    ], notes: ['El QR identifica paciente + tratamiento + ciclo + día y deja trazabilidad del escaneo.', 'Una aplicación completada es inmutable; la siguiente conserva su circuito independiente.'],
    warning: 'No inicie si la preparación no fue liberada, está vencida o no se completó el doble control.',
    keywords: ['preparación', 'sala', 'administración', 'QR', 'doble control', 'mezcla', 'cierre', 'reacción']
  },
  {
    id: 'configuracion', eyebrow: 'Administración', title: 'Configurar el sistema sin programar',
    summary: 'Configuración centraliza contenidos institucionales, operación, IA y acceso. Cada cambio queda versionado en PostgreSQL.', roles: ['Administración'],
    steps: [
      { title: 'Protocolos', detail: 'Cree o modifique esquemas, drogas, preparación, días, ciclos y duración; archive sin destruir el historial.' },
      { title: 'Diagnósticos, guías y plantillas', detail: 'Gestione equivalencias SNOMED/CIE-10/AJCC, PDF clínicos e imágenes anatómicas autorizadas.' },
      { title: 'Calculadoras e investigación', detail: 'Construya scores, fórmulas y formularios mediante editores visuales, y pruebe antes de activar.' },
      { title: 'Hospital de día', detail: 'Defina cantidad de sillones, jornada e intervalo de grilla de 5, 10, 15, 20 o 30 minutos.' },
      { title: 'IA, usuarios y permisos', detail: 'Configure el servicio LLM y administre cuentas, roles, permisos y duración de sesión.' }
    ], notes: ['Desactivar preserva revisiones y referencias históricas; no equivale a borrar.', 'Un respaldo completo incluye PostgreSQL y el volumen privado de archivos.'],
    warning: 'Aplique mínimo privilegio y pruebe los cambios operativos antes de utilizarlos con pacientes.',
    keywords: ['configuración', 'protocolos', 'guías', 'plantillas', 'calculadoras', 'investigación', 'LLM', 'usuarios', 'roles']
  },
  {
    id: 'problemas', eyebrow: 'Resolución rápida', title: 'Si algo no avanza',
    summary: 'Los bloqueos suelen corresponder a una condición clínica pendiente, un permiso o un cambio concurrente.', roles: ['Todos'],
    steps: [
      { title: 'Control deshabilitado', detail: 'Revise permisos y condiciones previas. La interfaz y la API validan ambos.' },
      { title: 'La aplicación no aparece', detail: 'Compruebe filtros, fecha, estado de prescripción y si ya fue turnada o completada.' },
      { title: 'No permite PASS', detail: 'Verifique turno activo, validación farmacéutica y medicación asegurada.' },
      { title: 'No permite administrar', detail: 'Verifique PASS, preparación liberada y vigente, identidad, etiqueta y segundo profesional.' },
      { title: 'Cambio simultáneo', detail: 'No fuerce el guardado. Recupere la versión actual, compare y repita el cambio sobre esa base.' }
    ], warning: 'Ante una duda de identidad, dosis, medicación o estado clínico, detenga el circuito y confirme con el profesional responsable.',
    keywords: ['error', 'bloqueo', 'no aparece', 'deshabilitado', 'concurrencia', 'ayuda', 'problema']
  }
];
