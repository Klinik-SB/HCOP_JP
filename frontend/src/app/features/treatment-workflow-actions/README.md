# Acciones del flujo de tratamiento

Componente Angular embebible que conserva el contrato clínico del backend para suspender, postergar, solicitar prescripción o continuidad y reanudar un tratamiento.

## Integración

Selector: `app-treatment-workflow-actions`.

Entradas:

- `treatment` (obligatoria): paciente, tratamiento, ciclo y estado de continuidad/prescripción devueltos por la API clínica.
- `buttonLabel`: texto del botón; por defecto `Gestionar ciclo`.
- `disabled`: bloqueo externo.
- `compact`: oculta el texto del disparador en espacios estrechos.

Salidas:

- `changed`: acción confirmada, paciente, tratamiento, ciclo y respuesta íntegra del backend.
- `notification`: mensaje breve para el sistema de avisos de la pantalla anfitriona.
- `sessionExpired`: informa una respuesta 401 para que la pantalla anfitriona recupere la sesión.

El backend es la única autoridad que agrega la evolución a la historia. Tras una operación exitosa el componente solicita a `PatientWorkspaceService` la versión confirmada del paciente activo y emite `changed` para que la vista operativa actualice sus listas.

La postergación usa el contrato real de suspensión transitoria (`kind: temporary`) con `resumeDate`; no crea un tratamiento ni un ciclo paralelo. La reanudación sólo aparece en el ciclo suspendido cuando su prescripción está confirmada.

El modal no se cierra por tocar el fondo ni por temporizador. Los campos editados se registran en `ClinicalDraftRegistryService` y exigen confirmación antes de descartar.
