# Resaltado clínico Angular

Esta carpeta reemplaza el resaltador de `app.js` con una capacidad Angular
aislada. No navega, no usa `window.location`, no escribe HTML clínico y no
persiste por su cuenta.

## API pública

- `applyClinicalHighlightAction(state, action, selections, at)` devuelve un
  estado nuevo y un resultado tipado; nunca muta el estado recibido.
- `normalizeClinicalHighlights`, `resolveClinicalHighlightRange` y
  `mergeClinicalHighlightRanges` implementan el contrato persistido y la
  reubicación por contexto del legacy.
- `ClinicalHighlightHostDirective` captura y dibuja únicamente dentro del nodo
  que la contiene. Emite `hcopClinicalHighlightMutation` para que la historia
  activa decida cómo guardar.
- `ClinicalHighlightActionDirective` conserva la selección en `pointerdown` y
  ejecuta `highlight` o `remove` en `click`, igual que la interacción legacy.
- `ClinicalHighlightCoordinatorService` comunica botones y hoja sin variables
  globales. `ClinicalHighlightFeedbackComponent` reutiliza las clases visuales
  `.toast` y `.show` ya cargadas por el frontend.

## Integración mínima

El componente de la hoja importa `ClinicalHighlightHostDirective`, delimita el
documento y declara cada destino estable:

```html
<article
  class="paper-sheet clinical-document"
  [hcopClinicalHighlightHost]="workspace.state"
  [hcopClinicalHighlightDisabled]="workspaceService.hasPendingClinicalWork()"
  (hcopClinicalHighlightMutation)="saveClinicalHighlight($event)">

  <section
    class="doc-section"
    data-highlight-scope
    data-highlight-kind="section"
    data-highlight-section-key="chiefComplaint">
    ...
  </section>

  <article
    class="doc-entry evolution-entry"
    data-highlight-scope
    data-highlight-kind="record"
    data-highlight-record-type="evolution"
    [attr.data-highlight-record-id]="record.id">
    ...
  </article>
</article>
```

El manejador delega en la cadena de guardado clínico existente. La proyección
amarilla se muestra de forma optimista, pero se confirma sólo con la respuesta
canónica de Java:

```ts
saveClinicalHighlight(event: ClinicalHighlightMutation): void {
  this.workspaceService.saveState(event.state).subscribe({
    next: () => event.commit(),
    error: () => event.rollback()
  });
}
```

El shell importa `ClinicalHighlightActionDirective` y reemplaza únicamente los
handlers provisionales de los dos botones:

```html
<button class="icon-button clinical-highlighter-button"
        type="button" hcopClinicalHighlightAction="highlight">...</button>
<button class="icon-button clinical-unhighlight-button"
        type="button" hcopClinicalHighlightAction="remove">...</button>
<app-clinical-highlight-feedback />
```

## Límites y seguridad DOM

- Monte un host por hoja clínica, nunca sobre `body` ni sobre toda la aplicación.
- Sólo se recorren nodos de texto cuyo ancestro más próximo posee
  `data-highlight-scope`; botones, SVG, auditorías y acciones quedan excluidos.
- Se admiten hasta 1.000 anclas y 10.000 caracteres por selección; prefijo y
  sufijo se acotan a 64 caracteres al normalizar.
- El render crea exclusivamente `mark.clinical-text-highlight`, conservando el
  amarillo, el radio de 2 px y la impresión definidos por el CSS legacy.
- `commit()` debe llamarse sólo después de que Java confirme el guardado;
  `rollback()` restaura el estado canónico cuando falla o aparece un conflicto.
- La directiva debe recibir el nuevo objeto `workspace.state` cada vez que la
  historia cambie. No use `innerHTML`, `app.js` ni un segundo repositorio local.
