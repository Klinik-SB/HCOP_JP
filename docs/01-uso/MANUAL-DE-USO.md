# Manual de uso

## Cabecera

- **Nuevo paciente**: abre un formulario limpio y crea una historia vacía.
- **Abrir paciente**: busca en PostgreSQL por nombre, DNI, HC o ID.
- **Hospital de día**: abre el espacio operativo global.
- **Imprimir**: imprime la hoja clínica visible.
- **Configuración**: administra protocolos, guías, calculadoras, investigación,
  agenda, diagnósticos, LLM, usuarios y permisos.
- **Ayuda**: abre la documentación funcional.
- **Campana**: muestra solicitudes clínicas asignadas al usuario.
- **Usuario**: informa quién firma las acciones y permite cerrar sesión.

## Hoja clínica izquierda

Es la historia longitudinal. Contiene identidad, diagnóstico, motivo de
consulta, enfermedad actual, antecedentes, estudios complementarios, examen
físico, tratamientos sistémicos, cirugías, resumen y evoluciones.

**Agregar diagnóstico** exige la clasificación configurada. El estadio AJCC se
calcula desde TNM cuando existe regla; si la combinación no tiene resultado, el
campo queda editable. Los diagnósticos no se pisan: se agregan para conservar la
historia de tumores múltiples.

**Agregar evolución** permite documentar texto clínico. Tratamientos, QR,
suspensiones, continuidad y finalizaciones también agregan evoluciones
automáticas e inmutables.

## Panel derecho

- **Estudios**: carga múltiple, pegar imagen, plantillas y anotaciones.
- **H. de día**: tratamiento y aplicaciones del paciente activo.
- **Prescripción**: medicamentos, certificados y formularios sistémicos.
- **Agente**: asistente LLM opcional; no funciona hasta configurarlo.
- **Investigación**: formularios personalizados.
- **Línea del tiempo**: cronología clínica y resumen asistido.
- **Protocolos**: consulta de esquemas, drogas y duración.
- **Herramientas**: calculadoras y estadificación.

## Hospital de Día global

- **Nuevo tratamiento**: prescribe para el paciente activo.
- **Farmacia**: registra prescripción y disponibilidad de medicación e imprime
  el QR.
- **Sillones**: agenda ciclos pendientes por duración y evita superposiciones.
- **Tratamientos**: abre detalle longitudinal, ciclos, aplicaciones y
  documentos.
- **Escanear QR**: identifica el ciclo a administrar y deja trazabilidad.

## Estudios

Se admiten imágenes, PDF, Word, PowerPoint y video. Las cargas se almacenan en
el volumen clínico y la historia guarda su referencia. Durante 24 horas y en la
misma sesión, el archivo puede eliminarse con su token temporal.

Las anotaciones se rasterizan como una imagen nueva; la fuente original no se
modifica silenciosamente.
