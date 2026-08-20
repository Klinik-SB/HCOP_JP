# Hub Angular de Configuración

Punto único de entrada para la configuración administrativa de HCOP. Integra, sin recargar ni
duplicar editores, los módulos Angular de protocolos, catálogos y operaciones.

## Integración en el router

```ts
{
  path: 'configuration',
  canActivate: [authenticatedGuard],
  canDeactivate: [pendingConfigurationChangesGuard],
  loadComponent: () => import('./features/configuration/configuration-hub')
    .then((module) => module.ConfigurationHubComponent),
  title: 'Configuración · HCOP Centro Oncológico'
}
```

Selector disponible: `app-configuration-hub`.

La pestaña puede abrirse directamente mediante `?tab=`. Valores válidos: `protocols`,
`diagnoses`, `guides`, `templates`, `calculators`, `research`, `day-hospital`, `llm` y `access`.

## Permisos

- `section.configuration.view`: permite abrir y consultar el hub.
- `section.configuration.manage`: habilita las operaciones administrativas.
- `section.protocols.edit`: junto con el permiso de administración, habilita la edición de protocolos.

El guard `pendingConfigurationChangesGuard` consulta al usuario cuando el editor de catálogos
informa cambios sin guardar. Los demás editores permanecen montados al cambiar de pestaña, por lo
que conservan sus borradores durante toda la visita al hub.
