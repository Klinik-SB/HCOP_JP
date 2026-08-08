# Centro de ayuda Angular

Centro de ayuda nativo, sin `iframe` ni ejecución del JavaScript histórico. Resume el manual y las guías operativas existentes con HTML accesible, búsqueda y filtro por rol.

Integración lazy recomendada:

```ts
{
  path: 'help',
  canActivate: [authenticatedGuard],
  loadComponent: () => import('./features/help').then((module) => module.HelpCenterComponent),
  title: 'Ayuda · HCOP Centro Oncológico'
}
```

El componente incluye un `RouterLink` a `/` para volver a la ficha clínica.
