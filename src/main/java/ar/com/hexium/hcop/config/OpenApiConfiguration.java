package ar.com.hexium.hcop.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeIn;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.annotations.servers.Server;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import java.lang.reflect.Method;
import java.util.Map;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.HandlerMethod;

@Configuration
@OpenAPIDefinition(
    info = @Info(
        title = "HCOP JP API",
        version = "1.0.0",
        description = """
            API del sistema integrado de Historia Clínica Oncológica y Hospital de Día.

            La aplicación sigue MVC: los controladores reciben y validan HTTP, los servicios
            concentran reglas clínicas y transacciones, y los repositorios son la única capa
            que accede a PostgreSQL. Los actos clínicos relevantes generan auditoría y
            evoluciones inmutables.
            """,
        contact = @Contact(name = "HCOP JP"),
        license = @License(name = "Uso interno clínico")),
    servers = {
        @Server(url = "/", description = "Servidor actual")
    },
    tags = {
        @Tag(name = "Autenticación", description = "Login obligatorio, sesión y paciente activo."),
        @Tag(name = "Pacientes e historia", description = "Identidad, historia clínica, diagnósticos y evoluciones."),
        @Tag(name = "Tratamientos", description = "Prescripción, protocolos, ciclos y documentos."),
        @Tag(name = "Hospital de Día", description = "Turnero por sillón, farmacia, administración y QR."),
        @Tag(name = "Flujos clínicos", description = "Suspensión, continuidad y solicitudes entre usuarios."),
        @Tag(name = "Configuración", description = "Protocolos, guías, calculadoras, formularios y parámetros."),
        @Tag(name = "Catálogos", description = "AJCC, TNM, CIE-10, SNOMED, drogas y formularios."),
        @Tag(name = "Archivos clínicos", description = "Estudios, imágenes y plantillas con control de sesión."),
        @Tag(name = "Administración", description = "Usuarios, roles, permisos y seguridad."),
        @Tag(name = "Integraciones", description = "Configuración y uso opcional del LLM."),
        @Tag(name = "Estado", description = "Salud y diagnóstico operativo del sistema.")
    })
@SecurityScheme(
    name = "sessionCookie",
    type = SecuritySchemeType.APIKEY,
    in = SecuritySchemeIn.COOKIE,
    paramName = "HCOP_SESSION",
    description = "Cookie HttpOnly obtenida mediante POST /api/auth/login.")
public class OpenApiConfiguration {

  private static final Map<String, Documentation> DOCUMENTATION = Map.ofEntries(
      doc("AuthController.me", "Consultar sesión", "Devuelve el usuario, roles, permisos y paciente activo; no expone el token."),
      doc("AuthController.login", "Iniciar sesión", "Valida usuario y contraseña y crea una cookie HttpOnly SameSite=Strict."),
      doc("AuthController.logout", "Cerrar sesión", "Revoca la sesión actual y elimina su cookie."),
      doc("AuthController.password", "Cambiar contraseña", "Cambia la contraseña y revoca las otras sesiones del usuario."),
      doc("AuthController.activePatient", "Cambiar paciente activo", "Asocia o limpia el paciente activo únicamente para la sesión actual."),
      doc("PatientController.search", "Buscar pacientes", "Busca por nombre, apellido, DNI, historia clínica o identificador local."),
      doc("PatientController.create", "Crear paciente", "Crea un paciente local, su hoja clínica en blanco y lo deja activo."),
      doc("PatientController.preview", "Previsualizar paciente", "Resume disponibilidad y cantidad de registros antes de abrir la historia."),
      doc("PatientController.importPatient", "Abrir paciente local", "Activa una historia ya consolidada en PostgreSQL; no consulta Lira."),
      doc("ClinicalDocumentController.get", "Leer historia clínica", "Recupera la hoja del paciente activo o la plantilla en blanco."),
      doc("ClinicalDocumentController.put", "Guardar historia clínica", "Guarda con control optimista de revisión para evitar pisar cambios concurrentes."),
      doc("ClinicalDocumentController.restoreDemo", "Compatibilidad de persistencia", "Confirma que la historia es persistente y que no se restaura un demo."),
      doc("DiagnosisController.list", "Listar diagnósticos", "Lista todos los diagnósticos oncológicos no archivados del paciente."),
      doc("DiagnosisController.link", "Validar diagnóstico de tratamiento", "Confirma que el diagnóstico seleccionado pertenece a la historia del paciente."),
      doc("TreatmentController.list", "Listar tratamientos", "Devuelve tratamientos oncológicos locales y su estado actual."),
      doc("TreatmentController.create", "Prescribir tratamiento", "Crea tratamiento, ciclos, logística y una evolución clínica inmutable en una transacción."),
      doc("TreatmentController.options", "Opciones de prescripción", "Devuelve diagnósticos, esquemas, tipos, intención y estados de consentimiento."),
      doc("TreatmentController.requirements", "Calcular requisitos del esquema", "Indica antropometría y variables necesarias antes de iniciar el protocolo."),
      doc("TreatmentController.detail", "Abrir detalle de tratamiento", "Integra protocolo, drogas, ciclos y turnos reales de PostgreSQL."),
      doc("TreatmentController.schemes", "Buscar esquemas", "Busca protocolos COIR y personalizados activos."),
      doc("TreatmentController.duration", "Consultar duración", "Devuelve la duración operativa estimada del esquema."),
      doc("TreatmentDocumentController.consent", "Abrir consentimiento", "Entrega el consentimiento guardado; responde 404 si no existe archivo."),
      doc("TreatmentDocumentController.treatmentSheet", "Generar hoja de tratamiento", "Genera una hoja imprimible con paciente, esquema, drogas, turno y estados."),
      doc("TreatmentDocumentController.prescription", "Abrir prescripción", "Entrega el documento de prescripción guardado sin reconstruir uno inexistente."),
      doc("InfusionController.list", "Listar turnos", "Lista turnos por paciente y/o fecha con farmacia, administración y medicación."),
      doc("InfusionController.create", "Asignar turno a sillón", "Reserva el bloque completo; PostgreSQL rechaza superposiciones concurrentes."),
      doc("InfusionController.update", "Actualizar turno", "Mueve, cancela o avanza un turno usando control de versión."),
      doc("InfusionController.candidates", "Listar ciclos pendientes", "Ordena los ciclos no turnados por fecha planificada y continuidad."),
      doc("InfusionController.logistics", "Actualizar farmacia y prescripción", "Registra medicación recibida, en poder del paciente y estado de prescripción."),
      doc("InfusionController.finalizeInfusion", "Finalizar administración", "Completa la aplicación y agrega una evolución inmutable, de forma idempotente."),
      doc("QrWorkflowController.document", "Imprimir QR", "Genera un QR firmado para identificar paciente, tratamiento y ciclo sin texto clínico abierto."),
      doc("QrWorkflowController.scan", "Escanear QR", "Verifica firma, abre el turno correcto y documenta el escaneo en la historia."),
      doc("TreatmentWorkflowController.suspend", "Suspender tratamiento", "Suspende transitoria o definitivamente y documenta el motivo."),
      doc("TreatmentWorkflowController.resume", "Reanudar tratamiento", "Reanuda desde un ciclo válido y exige nueva prescripción cuando corresponde."),
      doc("TreatmentWorkflowController.create", "Crear solicitud clínica", "Solicita prescripción o continuidad a un usuario autorizado."),
      doc("TreatmentWorkflowController.inbox", "Consultar solicitudes", "Lista las solicitudes asignadas al usuario activo."),
      doc("TreatmentWorkflowController.seen", "Marcar solicitud leída", "Registra que el destinatario abrió la solicitud."),
      doc("TreatmentWorkflowController.resolve", "Resolver solicitud", "Confirma, rechaza, suspende o continúa y deja trazabilidad clínica."),
      doc("ConfigurationController.list", "Listar configuración", "Lista elementos activos o históricos de un tipo permitido."),
      doc("ConfigurationController.create", "Crear configuración", "Crea una definición versionada de guía, cálculo, formulario o parámetro."),
      doc("ConfigurationController.update", "Modificar configuración", "Actualiza con revisión optimista y conserva la versión anterior."),
      doc("ConfigurationController.archive", "Archivar configuración", "Desactiva el elemento sin borrar su historial."),
      doc("ConfigurationController.versions", "Listar versiones", "Devuelve el historial auditable del elemento."),
      doc("ConfigurationController.version", "Leer versión", "Recupera una revisión histórica exacta."),
      doc("ProtocolController.list", "Listar protocolos administrables", "Combina protocolos personalizados y catálogo COIR no vinculado."),
      doc("ProtocolController.get", "Abrir protocolo", "Devuelve componentes, duración, periodicidad y vínculos a drogas."),
      doc("ProtocolController.create", "Crear protocolo", "Crea un protocolo completo y actualiza inmediatamente el catálogo clínico."),
      doc("ProtocolController.update", "Modificar protocolo", "Edita componentes, preparación, tiempo y periodicidad con versionado."),
      doc("ProtocolController.archive", "Archivar protocolo", "Retira un protocolo de nuevas prescripciones sin romper tratamientos existentes."),
      doc("ProtocolController.coir", "Listar catálogo COIR", "Expone esquemas COIR, duración y periodicidad para vinculación."),
      doc("ProtocolController.drugs", "Buscar drogas de protocolo", "Busca drogas locales para relacionarlas con componentes del protocolo."),
      doc("ClinicalFileController.uploadStudy", "Subir estudio", "Guarda por streaming, valida formato y permite borrar durante la misma sesión."),
      doc("ClinicalFileController.study", "Abrir archivo de estudio", "Entrega el archivo autenticado con tipo y nombre seguros."),
      doc("ClinicalFileController.deleteStudy", "Eliminar carga reciente", "Elimina únicamente con el token temporal de la sesión que subió el archivo."),
      doc("ClinicalFileController.uploadImage", "Guardar imagen clínica", "Guarda una imagen o anotación rasterizada y valida su firma binaria."),
      doc("ClinicalFileController.image", "Abrir imagen clínica", "Entrega una imagen local autenticada y cacheable."),
      doc("StudyTemplateController.list", "Listar plantillas anatómicas", "Combina biblioteca incluida y plantillas personalizadas."),
      doc("StudyTemplateController.create", "Crear plantilla anatómica", "Guarda imagen, metadatos, licencia y confirmación de derechos."),
      doc("LlmController.config", "Leer configuración LLM", "Devuelve endpoint, modelo y parámetros sin revelar la API key."),
      doc("LlmController.updateConfig", "Guardar configuración LLM", "Valida y cifra la API key antes de persistirla."),
      doc("LlmController.status", "Consultar estado LLM", "Informa si la integración está habilitada y configurada."),
      doc("LlmController.test", "Probar conexión LLM", "Prueba un borrador de configuración sin guardarlo."),
      doc("LlmController.timeline", "Extraer línea de tiempo", "Solicita eventos estructurados y auditables a partir de texto clínico."),
      doc("LlmController.summarize", "Resumir eventos", "Resume hasta 250 eventos sin inventar información."),
      doc("LlmController.agent", "Consultar agente clínico", "Responde sobre el contexto entregado y diferencia hechos de inferencias."),
      doc("LlmController.fillSystemic", "Completar formulario sistémico", "Extrae únicamente campos configurados como asistidos por LLM."),
      doc("AdminController.users", "Listar usuarios", "Lista usuarios, roles y estado para administración."),
      doc("AdminController.createUser", "Crear usuario", "Crea una cuenta y asigna roles existentes."),
      doc("AdminController.updateUser", "Modificar usuario", "Actualiza perfil, estado, contraseña y roles."),
      doc("AdminController.roles", "Listar roles", "Lista roles y permisos disponibles."),
      doc("AdminController.createRole", "Crear rol", "Crea un rol personalizado con permisos explícitos."),
      doc("AdminController.updateRole", "Modificar rol", "Actualiza nombre, estado y permisos del rol."),
      doc("AdminController.security", "Leer seguridad", "Devuelve la política de acceso obligatorio y duración de sesión."),
      doc("AdminController.updateSecurity", "Modificar seguridad", "Mantiene login obligatorio y actualiza la duración de sesión."),
      doc("AdminController.clinicalUsers", "Buscar destinatarios clínicos", "Lista usuarios habilitados para una capacidad de flujo."),
      doc("StatusController.clinical", "Estado clínico", "Comprueba PostgreSQL y confirma que el sistema es local, unificado e independiente."),
      doc("StatusController.liraCompatibility", "Compatibilidad Lira", "Informa que las rutas históricas operan sobre HCOP JP local."),
      doc("StatusController.runtime", "Estado de ejecución", "Expone versión y motor para diagnóstico y automatización."),
      doc("StatusController.stop", "Instrucciones de detención", "Indica el mecanismo seguro de parada del contenedor.")
  );

  @Bean
  GroupedOpenApi completeApi(OperationCustomizer documentedOperations) {
    return GroupedOpenApi.builder()
        .group("hcop-jp-completa")
        .displayName("HCOP JP · API completa")
        .pathsToMatch("/api/**")
        .addOperationCustomizer(documentedOperations)
        .build();
  }

  @Bean
  GroupedOpenApi clinicalApi(OperationCustomizer documentedOperations) {
    return GroupedOpenApi.builder()
        .group("clinica")
        .displayName("Clínica y Hospital de Día")
        .pathsToMatch("/api/clinical/**", "/api/hc/**", "/api/media/**")
        .addOperationCustomizer(documentedOperations)
        .build();
  }

  @Bean
  GroupedOpenApi administrationApi(OperationCustomizer documentedOperations) {
    return GroupedOpenApi.builder()
        .group("administracion")
        .displayName("Administración y configuración")
        .pathsToMatch("/api/admin/**", "/api/config", "/api/guides/**", "/api/study-templates/**")
        .addOperationCustomizer(documentedOperations)
        .build();
  }

  @Bean
  OperationCustomizer documentedOperations() {
    return (operation, handlerMethod) -> {
      Method method = handlerMethod.getMethod();
      String controller = handlerMethod.getBeanType().getSimpleName();
      Documentation documentation = DOCUMENTATION.get(controller + "." + method.getName());
      if (documentation != null) {
        operation.setSummary(documentation.summary());
        operation.setDescription(documentation.description());
      } else if (operation.getSummary() == null || operation.getSummary().isBlank()) {
        operation.setSummary(method.getName());
        operation.setDescription("Operación MVC del módulo " + controller.replace("Controller", "") + ".");
      }
      operation.addTagsItem(tag(controller));
      operation.addExtension("x-hcop-controller", controller);
      if (requiresSession(controller, method.getName())) {
        operation.addSecurityItem(new SecurityRequirement().addList("sessionCookie"));
        operation.addExtension("x-hcop-authentication", "cookie HttpOnly y permiso por rol");
      }
      return operation;
    };
  }

  private static boolean requiresSession(String controller, String method) {
    if ("StatusController".equals(controller) && !"stop".equals(method)) return false;
    return !("AuthController".equals(controller) && ("login".equals(method) || "me".equals(method)));
  }

  private static String tag(String controller) {
    if (controller.startsWith("Auth")) return "Autenticación";
    if (controller.startsWith("Patient") || controller.startsWith("ClinicalDocument") ||
        controller.startsWith("Diagnosis")) return "Pacientes e historia";
    if (controller.startsWith("TreatmentDocument") || controller.startsWith("TreatmentController")) return "Tratamientos";
    if (controller.startsWith("Infusion") || controller.startsWith("Qr")) return "Hospital de Día";
    if (controller.startsWith("TreatmentWorkflow")) return "Flujos clínicos";
    if (controller.startsWith("Configuration") || controller.startsWith("Protocol")) return "Configuración";
    if (controller.startsWith("ClinicalFile") || controller.startsWith("StudyTemplate")) return "Archivos clínicos";
    if (controller.startsWith("Admin")) return "Administración";
    if (controller.startsWith("Llm")) return "Integraciones";
    if (controller.startsWith("Status")) return "Estado";
    return "Catálogos";
  }

  private static Map.Entry<String, Documentation> doc(String key, String summary, String description) {
    return Map.entry(key, new Documentation(summary, description));
  }

  private record Documentation(String summary, String description) {
  }
}
