# Corte Angular 001 · base y paciente activo

Este corte inicia el frontend Angular desde el commit `d4731f0` sin modificar
el contrato clínico, las tablas ni las rutas de la versión vigente.

## Qué se incorporó

- `frontend/` contiene una aplicación Angular standalone con TypeScript estricto.
- La compilación Angular entra en el JAR desde `Dockerfile`; el navegador la
  recibe en `/app/` y conserva la misma sesión HTTP que la interfaz actual.
- `core/auth` consulta, inicia y cierra sesión por `/api/auth/**`.
- `core/patients` busca pacientes, activa el contexto y lo cierra mediante las
  rutas ya autoritativas del backend.
- `features/clinical-workspace` presenta la hoja clínica real que devuelve
  PostgreSQL: identidad, diagnóstico, antecedentes, estudios, examen físico,
  tratamientos, conclusión y evoluciones.
- La hoja de estilos histórica se carga como contrato visual desde Angular.
  No se ejecuta `app.js`, no se usa iframe y las reglas clínicas siguen en Java.

## Flujo verificado por compilación

1. Usuario autenticado abre `http://localhost:5180/app/`.
2. Angular recupera `/api/auth/me`.
3. Si hay paciente activo, consulta su espacio con
   `GET /api/clinical/patients/{id}/workspace`.
4. El botón **Abrir paciente** busca con
   `GET /api/clinical/patients?q=...` y activa con
   `POST /api/clinical/patients/{id}/activate`.
5. **Cerrar paciente** usa `PUT /api/auth/active-patient` con `patientId: null`.

La compilación `npm.cmd run build` finalizó correctamente el 01/08/2026.

## Aún en convivencia

La edición de secciones, la carga/edición de Estudios, las solapas del panel
derecho y el Hospital de Día continúan implementados en la interfaz vigente.
No se retiran ni se redirigen hasta que cada recorrido tenga paridad funcional,
visual, de permisos y de persistencia.
