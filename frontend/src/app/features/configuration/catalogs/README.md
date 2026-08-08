# Catálogos clínicos de Configuración

Implementación Angular nativa, sin `iframe` ni salto a `/configuration/`, de tres superficies históricas:

- equivalencias y visibilidad diagnóstica (SNOMED CT, CIE-10 y AJCC);
- biblioteca de guías PDF;
- biblioteca de plantillas anatómicas incluidas y propias.

## Integración

Importar `ConfigurationCatalogsComponent` y montar:

```html
<app-configuration-catalogs [initialSection]="'diagnoses'" [showSectionTabs]="false" />
```

`initialSection` acepta `diagnoses`, `guides` o `templates`. `showSectionTabs=false` permite que el
Centro de configuración conserve su navegación lateral sin duplicar pestañas; en modo autónomo puede
dejarse en `true`. La instancia expone `activate(section)` y `hasUnsavedChanges()` para que el
contenedor coordine la navegación sin perder borradores.

## Contratos HTTP preservados

| Función | Endpoints |
|---|---|
| Guías | `GET /api/guides?includeInactive=1`, `PUT /api/guides/import`, CRUD de `/api/clinical/configuration/guide` |
| Plantillas | `GET/POST /api/study-templates`, CRUD de `/api/clinical/configuration/study-template` |
| Diagnósticos | CRUD de `/api/clinical/configuration/diagnosis-equivalence`, CRUD de `/api/clinical/configuration/diagnosis-setting`, `GET /api/diagnosis-catalogs/search` |

Todas las solicitudes conservan credenciales de sesión y las escrituras emiten
`hcop-configuration-updated`, igual que la interfaz estable.

## Reglas preservadas

- las guías importadas deben ser PDF;
- una plantilla nueva debe ser PNG/JPEG/GIF/WebP, pesar hasta 15 MB, informar título, categoría,
  autor, licencia y confirmación de derechos; las URLs opcionales deben usar HTTPS;
- las plantillas incluidas son de solo lectura;
- una equivalencia activa requiere código y descripción en las tres terminologías;
- un borrador desactivado puede omitir SNOMED/CIE-10, pero siempre necesita AJCC;
- al menos una clasificación diagnóstica debe permanecer visible;
- las actualizaciones usan `expectedRevision` cuando el backend la entrega.

## Verificación aislada

El archivo `configuration-catalogs.normalizers.tests.ts` prueba normalización, payloads y reglas.
`tsconfig.catalogs.json` permite compilar componente, plantilla HTML, servicio y modelos con `ngc --noEmit`.
