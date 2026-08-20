# Corte Angular 002 · Estudios, línea de tiempo y alta de pacientes

Este corte continúa desde el espacio clínico inicial sin alterar contratos,
permisos, tablas ni persistencia del sistema vigente.

## Recorridos ya trasladados

- `features/patients/new-patient-modal` implementa **Nuevo paciente**. Valida
  nombre, apellido, DNI o historia clínica, correo y fecha de nacimiento; usa
  `POST /api/clinical/patients` y deja la ficha nueva activa en la sesión.
- `features/studies` implementa **Estudios** con búsqueda, carga múltiple,
  arrastre y pegado de imágenes desde el portapapeles. El archivo se almacena
  por `POST /api/media/studies` y la ficha se confirma por `PUT /api/hc`, con
  la revisión autoritativa de PostgreSQL. Las imágenes cargadas durante la
  sesión se pueden eliminar con el token temporal ya provisto por Java.
- `features/timeline` implementa **Línea de tiempo** a partir de diagnósticos,
  estudios, evoluciones, tratamientos, prescripciones e investigación. Incluye
  búsqueda, filtros por clase, hitos y agrupación año → mes → día.

## Contrato visual y de seguridad

Angular reutiliza las clases y hojas de estilo históricas para conservar las
métricas del producto. No carga `app.js`, no usa iframe y no duplica reglas de
negocio. El backend Java conserva la autorización por sección y PostgreSQL sigue
siendo el único origen de persistencia.

## Verificación realizada

La compilación estricta del frontend se ejecutó correctamente con:

```powershell
Set-Location C:\Proyectos\HCOP_AHJP\frontend
npm.cmd run build
```

## Pendiente de los próximos cortes

La edición rica de imágenes y plantillas anatómicas, prescripción,
investigación, protocolos, herramientas, configuración y Hospital de Día se
migrarán por recorrido completo. La interfaz anterior queda solamente como ruta
estable de referencia (`/`) mientras cada capacidad alcanza paridad funcional,
visual, de permisos y de persistencia en `/app/`.
