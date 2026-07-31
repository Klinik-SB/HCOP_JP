# Reglas ejecutables de arquitectura

La arquitectura objetivo no depende sólo de convenciones escritas. ArchUnit
analiza el bytecode en cada `mvn verify` y detiene el build cuando una clase
nueva rompe la dirección de dependencias.

Se usa ArchUnit 1.4.2, la versión publicada por el proyecto para JUnit 5 al
iniciar esta migración.

## Reglas activas

1. Una clase bajo `domain` no depende de Spring, Servlet, Jakarta Validation,
   Flyway, PostgreSQL, Jackson ni Swagger.
2. Una clase bajo `application` no depende de `infrastructure`.
3. Una clase bajo `application` tampoco depende de frameworks web, persistencia
   o serialización.
4. Un adaptador de persistencia no depende del adaptador web.
5. Un adaptador web no depende directamente del adaptador de persistencia.

Las reglas se aplican desde que una clase entra en la estructura nueva. El
código anterior continúa fuera de esos paquetes hasta que su capacidad se
migre y pase sus pruebas de paridad.

## Estructura piloto

El módulo `configuration` inaugura la estructura:

```text
configuration
├── domain
├── application
│   ├── port
│   │   ├── in
│   │   └── out
│   └── service
└── infrastructure
    ├── web
    └── persistence
```

La fase siguiente reemplaza progresivamente `ConfigurationController`,
`ConfigurationService` y `ConfigurationRepository` mediante esta estructura.
No se cambian sus rutas ni su JSON durante la convivencia.

## Kernel compartido

El kernel inicial contiene únicamente:

- `PatientId`;
- `TreatmentId`;
- `UserId`;
- `ApplicationKey`;
- `Revision`.

Son objetos de valor Java puros. Evitan mezclar identificadores o perder
precisión, pero no trasladan reglas propias de un módulo al espacio compartido.
Agregar un elemento al kernel exige justificar que sea estable y utilizado por
más de un contexto.
